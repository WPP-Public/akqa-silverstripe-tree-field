import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'reactstrap';
import i18n from 'i18n';

/**
 * One row in the tree.
 *
 * Dragging is the quick path, but every move is also available from the row's menu, so the tree
 * is fully operable from the keyboard and by anyone who cannot drag.
 */
const TreeRow = ({
  node,
  depth,
  indentationWidth,
  selected = false,
  collapsed = false,
  readonly = false,
  isDragging = false,
  isGhost = false,
  onSelect,
  onToggleCollapse,
  onAddChild,
  onDelete,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
  canIndent = false,
  canOutdent = false,
  addChildLabel = '',
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: node.id, disabled: readonly || !node.canEdit });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingInlineStart: `${(depth - 1) * indentationWidth}px`,
  };

  const hasChildren = node.childCount > 0;
  const showActions = !readonly && (node.canAddChildren || node.canDelete || node.canEdit);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={classnames('tree-field__row', {
        'tree-field__row--selected': selected,
        'tree-field__row--dragging': isDragging,
        'tree-field__row--ghost': isGhost,
        'tree-field__row--disabled': !node.canEdit,
        [`tree-field__row--${node.status}`]: Boolean(node.status),
      })}
      data-node-id={node.id}
    >
      <div className="tree-field__row-inner">
        {!readonly && node.canEdit && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="tree-field__handle btn"
            aria-label={i18n._t('TreeField.REORDER', 'Reorder')}
            {...attributes}
            {...listeners}
          >
            <span className="font-icon-drag-handle" aria-hidden="true" />
          </button>
        )}

        {hasChildren ? (
          <button
            type="button"
            className="tree-field__toggle btn"
            aria-expanded={!collapsed}
            aria-label={collapsed
              ? i18n._t('TreeField.EXPAND', 'Expand')
              : i18n._t('TreeField.COLLAPSE', 'Collapse')}
            onClick={() => onToggleCollapse(node.id)}
          >
            <span
              className={collapsed ? 'font-icon-right-open-big' : 'font-icon-down-open-big'}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="tree-field__toggle tree-field__toggle--empty" aria-hidden="true" />
        )}

        <button
          type="button"
          className="tree-field__label"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(node.id)}
        >
          <span className={classnames('tree-field__icon', node.icon)} aria-hidden="true" />
          <span className="tree-field__title">{node.title}</span>
          {node.subtitle && (
            <span className="tree-field__subtitle">{node.subtitle}</span>
          )}
          {(node.badges || []).map((badge) => (
            <span
              key={`${node.id}-${badge.text}`}
              className={classnames('badge', 'tree-field__badge', `badge-${badge.type || 'secondary'}`)}
            >
              {badge.text}
            </span>
          ))}
        </button>

        {showActions && (
          <div className="tree-field__row-actions">
            {node.canAddChildren && (
              <button
                type="button"
                className="tree-field__action btn"
                onClick={() => onAddChild(node.id)}
                aria-label={addChildLabel}
                title={addChildLabel}
              >
                <span className="font-icon-plus-circled" aria-hidden="true" />
              </button>
            )}

            <UncontrolledDropdown>
              <DropdownToggle
                className="tree-field__action btn"
                color="link"
                aria-label={i18n._t('TreeField.MORE_ACTIONS', 'More actions')}
              >
                <span className="font-icon-dot-3" aria-hidden="true" />
              </DropdownToggle>
              <DropdownMenu end>
                <DropdownItem
                  disabled={!canMoveUp}
                  onClick={() => onMove(node.id, 'up')}
                >
                  {i18n._t('TreeField.MOVE_UP', 'Move up')}
                </DropdownItem>
                <DropdownItem
                  disabled={!canMoveDown}
                  onClick={() => onMove(node.id, 'down')}
                >
                  {i18n._t('TreeField.MOVE_DOWN', 'Move down')}
                </DropdownItem>
                <DropdownItem
                  disabled={!canIndent}
                  onClick={() => onMove(node.id, 'indent')}
                >
                  {i18n._t('TreeField.INDENT', 'Make a child of the row above')}
                </DropdownItem>
                <DropdownItem
                  disabled={!canOutdent}
                  onClick={() => onMove(node.id, 'outdent')}
                >
                  {i18n._t('TreeField.OUTDENT', 'Move out one level')}
                </DropdownItem>
                {node.canDelete && <DropdownItem divider />}
                {node.canDelete && (
                  <DropdownItem
                    className="tree-field__action--danger"
                    onClick={() => onDelete(node.id)}
                  >
                    {i18n._t('TreeField.DELETE', 'Delete')}
                  </DropdownItem>
                )}
              </DropdownMenu>
            </UncontrolledDropdown>
          </div>
        )}
      </div>
    </li>
  );
};

TreeRow.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    icon: PropTypes.string,
    badges: PropTypes.array,
    childCount: PropTypes.number,
    status: PropTypes.oneOf(['published', 'modified', 'draft']),
    canEdit: PropTypes.bool,
    canDelete: PropTypes.bool,
    canAddChildren: PropTypes.bool,
  }).isRequired,
  depth: PropTypes.number.isRequired,
  indentationWidth: PropTypes.number.isRequired,
  selected: PropTypes.bool,
  collapsed: PropTypes.bool,
  readonly: PropTypes.bool,
  isDragging: PropTypes.bool,
  isGhost: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  onAddChild: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  canMoveUp: PropTypes.bool,
  canMoveDown: PropTypes.bool,
  canIndent: PropTypes.bool,
  canOutdent: PropTypes.bool,
  addChildLabel: PropTypes.string,
};


export default TreeRow;
