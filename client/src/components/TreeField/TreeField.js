import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import i18n from 'i18n';
import createApi from '../../lib/api';
import {
  flattenVisible,
  getDescendantIds,
  getPositionAmongSiblings,
  getProjection,
  getSubtreeHeight,
  findNode,
} from '../../lib/tree';
import TreeRow from './TreeRow';
import TreeDetail from './TreeDetail';

const INDENTATION_WIDTH = 24;

/**
 * A hierarchy of records, editable in place.
 *
 * The tree on the left is the structure; the panel on the right is the selected record's own
 * CMS fields. Every structural change is written straight away and the server sends the whole
 * tree back, so what is on screen is always what is in the database.
 */
const TreeField = ({
  urls,
  securityID,
  maxDepth,
  labels,
  showDetail,
  readonly,
  disabled,
  canAdd,
}) => {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [treeCanAdd, setTreeCanAdd] = useState(canAdd);

  const dirtyRef = useRef(false);
  const api = useMemo(() => createApi(urls, securityID), [urls, securityID]);
  const isReadonly = readonly || disabled;

  // Stable identity: the detail panel resets this whenever the selection changes
  const handleDirtyChange = useCallback((dirty) => {
    dirtyRef.current = dirty;
  }, []);

  const announce = useCallback((text, type = 'success') => {
    setMessage(text ? { text, type } : null);
  }, []);

  const applyTree = useCallback((payload) => {
    setNodes(payload.nodes || []);

    if (typeof payload.canAdd === 'boolean') {
      setTreeCanAdd(payload.canAdd);
    }
  }, []);

  const handleError = useCallback((error) => {
    announce(error.message || i18n._t('TreeField.ERROR', 'Something went wrong'), 'danger');
  }, [announce]);

  const loadTree = useCallback(() => {
    setLoading(true);

    return api.fetchTree()
      .then(applyTree)
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [api, applyTree, handleError]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const flattened = useMemo(() => {
    const hidden = activeId
      ? [...collapsedIds, activeId]
      : collapsedIds;

    return flattenVisible(nodes, hidden);
  }, [nodes, collapsedIds, activeId]);

  const sortedIds = useMemo(() => flattened.map(({ id }) => id), [flattened]);

  const activeItem = activeId ? flattened.find(({ id }) => id === activeId) : null;

  const subtreeHeight = useMemo(
    () => (activeId ? getSubtreeHeight(nodes, activeId) : 1),
    [nodes, activeId]
  );

  const projected = (activeId && overId)
    ? getProjection(
      flattened,
      activeId,
      overId,
      offsetLeft,
      INDENTATION_WIDTH,
      maxDepth,
      subtreeHeight
    )
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /**
   * Ask before throwing away edits the member has made in the detail panel.
   */
  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) {
      return true;
    }

    // eslint-disable-next-line no-alert
    const proceed = window.confirm(i18n._t(
      'TreeField.DISCARD_CHANGES',
      'You have unsaved changes. Discard them?'
    ));

    if (proceed) {
      dirtyRef.current = false;
    }

    return proceed;
  }, []);

  const handleSelect = useCallback((id) => {
    if (id === selectedId || !confirmDiscard()) {
      return;
    }

    setSelectedId(id);
    announce(null);
  }, [selectedId, confirmDiscard, announce]);

  const handleToggleCollapse = useCallback((id) => {
    setCollapsedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }, []);

  const runMutation = useCallback((promise, successMessage) => {
    setBusy(true);

    return promise
      .then((payload) => {
        applyTree(payload);

        if (successMessage) {
          announce(successMessage);
        }

        return payload;
      })
      .catch(handleError)
      .finally(() => setBusy(false));
  }, [applyTree, announce, handleError]);

  const handleAdd = useCallback((parentID) => {
    if (!confirmDiscard()) {
      return;
    }

    runMutation(
      api.addNode(parentID, -1),
      i18n._t('TreeField.ADDED', 'Added')
    ).then((payload) => {
      if (payload && payload.createdID) {
        setSelectedId(payload.createdID);

        if (parentID) {
          setCollapsedIds((current) => current.filter((item) => item !== parentID));
        }
      }
    });
  }, [api, runMutation, confirmDiscard]);

  const handleDelete = useCallback((id) => {
    const node = findNode(nodes, id);
    const childCount = node && node.children ? node.children.length : 0;

    const confirmed = window.confirm(childCount > 0
      ? i18n.inject(
        i18n._t('TreeField.CONFIRM_DELETE_BRANCH', 'Delete "{title}" and everything under it?'),
        { title: node.title }
      )
      : i18n.inject(
        i18n._t('TreeField.CONFIRM_DELETE', 'Delete "{title}"?'),
        { title: node ? node.title : '' }
      ));

    if (!confirmed) {
      return;
    }

    const removedIds = [id, ...getDescendantIds(nodes, id)];

    runMutation(
      api.deleteNode(id),
      i18n._t('TreeField.DELETED', 'Deleted')
    ).then(() => {
      if (removedIds.includes(selectedId)) {
        dirtyRef.current = false;
        setSelectedId(null);
      }
    });
  }, [api, nodes, selectedId, runMutation]);

  /**
   * Keyboard and menu driven moves. These go through the same endpoint as a drag.
   */
  const handleMove = useCallback((id, direction) => {
    const item = flattened.find((node) => node.id === id);

    if (!item) {
      return;
    }

    const siblings = flattened.filter((node) => node.parentId === item.parentId);
    const index = siblings.findIndex((node) => node.id === id);

    let parentId = item.parentId;
    let position = index;

    if (direction === 'up') {
      position = Math.max(0, index - 1);
    } else if (direction === 'down') {
      position = Math.min(siblings.length - 1, index + 1);
    } else if (direction === 'indent') {
      const previous = siblings[index - 1];

      if (!previous) {
        return;
      }

      parentId = previous.id;
      position = flattened.filter((node) => node.parentId === previous.id).length;
    } else if (direction === 'outdent') {
      const parent = flattened.find((node) => node.id === item.parentId);

      if (!parent) {
        return;
      }

      parentId = parent.parentId;
      position = flattened.filter((node) => node.parentId === parent.parentId)
        .findIndex((node) => node.id === parent.id) + 1;
    }

    if (parentId === item.parentId && position === index) {
      return;
    }

    runMutation(api.moveNode(id, parentId, position), i18n._t('TreeField.MOVED', 'Moved'));
  }, [api, flattened, runMutation]);

  const handleDragStart = useCallback(({ active }) => {
    if (!confirmDiscard()) {
      return;
    }

    setActiveId(active.id);
    setOverId(active.id);
    document.body.classList.add('tree-field-dragging');
  }, [confirmDiscard]);

  const handleDragMove = useCallback(({ delta }) => {
    setOffsetLeft(delta.x);
  }, []);

  const handleDragOver = useCallback(({ over }) => {
    setOverId(over ? over.id : null);
  }, []);

  const resetDrag = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    document.body.classList.remove('tree-field-dragging');
  }, []);

  const handleDragEnd = useCallback(({ active, over }) => {
    const currentProjection = projected;

    resetDrag();

    if (!over || !currentProjection || !currentProjection.allowed) {
      return;
    }

    const parentId = currentProjection.parentId;
    const position = getPositionAmongSiblings(flattened, active.id, over.id, parentId);
    const item = flattened.find((node) => node.id === active.id);

    if (item && item.parentId === parentId) {
      const siblings = flattened.filter((node) => node.parentId === parentId);
      const currentIndex = siblings.findIndex((node) => node.id === active.id);

      if (currentIndex === position) {
        return;
      }
    }

    runMutation(
      api.moveNode(active.id, parentId, position),
      i18n._t('TreeField.MOVED', 'Moved')
    );
  }, [projected, flattened, api, runMutation, resetDrag]);

  const canIndent = useCallback((item) => {
    const siblings = flattened.filter((node) => node.parentId === item.parentId);
    const index = siblings.findIndex((node) => node.id === item.id);
    const previous = siblings[index - 1];

    if (!previous || !previous.allowsChildren || !previous.canAddChildren) {
      return false;
    }

    const height = getSubtreeHeight(nodes, item.id);

    return maxDepth === 0 || (previous.depth + 1 + height - 1) <= maxDepth;
  }, [flattened, nodes, maxDepth]);

  /**
   * Outdenting moves a row up a level, so a type that is not allowed at the top level cannot
   * outdent out of the second.
   */
  const canOutdent = useCallback((item) => {
    if (item.depth <= 1) {
      return false;
    }

    return item.depth > 2 || item.allowsRoot !== false;
  }, []);

  const selectedNode = selectedId ? findNode(nodes, selectedId) : null;

  const rows = flattened.map((item) => {
    const siblings = flattened.filter((node) => node.parentId === item.parentId);
    const index = siblings.findIndex((node) => node.id === item.id);

    return (
      <TreeRow
        key={item.id}
        node={item}
        depth={activeId === item.id && projected ? projected.depth : item.depth}
        indentationWidth={INDENTATION_WIDTH}
        selected={item.id === selectedId}
        collapsed={collapsedIds.includes(item.id)}
        readonly={isReadonly}
        isDragging={item.id === activeId}
        onSelect={handleSelect}
        onToggleCollapse={handleToggleCollapse}
        onAddChild={handleAdd}
        onDelete={handleDelete}
        onMove={handleMove}
        canMoveUp={item.canEdit && index > 0}
        canMoveDown={item.canEdit && index < siblings.length - 1}
        canIndent={item.canEdit && canIndent(item)}
        canOutdent={item.canEdit && canOutdent(item)}
        addChildLabel={labels.addChild}
      />
    );
  });

  return (
    <div
      className={classnames('tree-field', {
        'tree-field--readonly': isReadonly,
        'tree-field--busy': busy,
        'tree-field--with-detail': showDetail,
      })}
    >
      <div className="tree-field__toolbar">
        {!isReadonly && treeCanAdd && (
          <button
            type="button"
            className="btn btn-primary font-icon-plus-circled tree-field__add"
            onClick={() => handleAdd(null)}
            disabled={busy}
          >
            {labels.addRoot}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary tree-field__collapse-all"
          onClick={() => setCollapsedIds(flattenVisible(nodes, []).filter((n) => n.childCount > 0).map((n) => n.id))}
        >
          {i18n._t('TreeField.COLLAPSE_ALL', 'Collapse all')}
        </button>
        <button
          type="button"
          className="btn btn-secondary tree-field__expand-all"
          onClick={() => setCollapsedIds([])}
        >
          {i18n._t('TreeField.EXPAND_ALL', 'Expand all')}
        </button>
      </div>

      <div className="tree-field__messages" role="status" aria-live="polite">
        {message && (
          <div className={classnames('alert', 'tree-field__message', `alert-${message.type}`)}>
            {message.text}
          </div>
        )}
      </div>

      <div className="tree-field__body">
        <div className="tree-field__tree">
          {loading && (
            <p className="tree-field__loading">{i18n._t('TreeField.LOADING', 'Loading…')}</p>
          )}

          {!loading && rows.length === 0 && (
            <p className="tree-field__empty">
              {i18n.inject(
                i18n._t('TreeField.NO_ITEMS', 'No {plural} yet'),
                { plural: labels.plural.toLowerCase() }
              )}
            </p>
          )}

          {!loading && rows.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={resetDrag}
            >
              <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
                <ul className="tree-field__list">
                  {rows}
                </ul>
              </SortableContext>
              <DragOverlay>
                {activeItem && (
                  <div className="tree-field__drag-overlay">
                    <span className={classnames('tree-field__icon', activeItem.icon)} aria-hidden="true" />
                    <span className="tree-field__title">{activeItem.title}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {showDetail && (
          <TreeDetail
            schemaUrl={urls.schema}
            nodeId={selectedId}
            nodeTitle={selectedNode ? selectedNode.title : ''}
            onSaved={() => loadTree()}
            onDirtyChange={handleDirtyChange}
            emptyMessage={i18n.inject(
              i18n._t('TreeField.SELECT_TO_EDIT', 'Select a {singular} to edit it'),
              { singular: labels.singular.toLowerCase() }
            )}
          />
        )}
      </div>
    </div>
  );
};

TreeField.propTypes = {
  urls: PropTypes.shape({
    tree: PropTypes.string.isRequired,
    add: PropTypes.string.isRequired,
    move: PropTypes.string.isRequired,
    delete: PropTypes.string.isRequired,
    schema: PropTypes.string.isRequired,
  }).isRequired,
  securityID: PropTypes.string.isRequired,
  maxDepth: PropTypes.number,
  labels: PropTypes.object,
  showDetail: PropTypes.bool,
  readonly: PropTypes.bool,
  disabled: PropTypes.bool,
  canAdd: PropTypes.bool,
};

TreeField.defaultProps = {
  maxDepth: 0,
  labels: {},
  showDetail: true,
  readonly: false,
  disabled: false,
  canAdd: false,
};

export default TreeField;
