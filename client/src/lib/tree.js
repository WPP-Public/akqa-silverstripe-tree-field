import { arrayMove } from '@dnd-kit/sortable';

/**
 * Helpers for turning the nested tree the server sends into the flat list dnd-kit sorts, and for
 * working out where a dragged row would land.
 *
 * Depth is 1 based to match the PHP side: a top level row is depth 1.
 */

/**
 * @param {Array} nodes nested nodes, each with a children array
 * @param {number} parentId
 * @param {number} depth
 * @returns {Array} flat list, parents immediately followed by their descendants
 */
export const flattenTree = (nodes, parentId = null, depth = 1) => nodes.reduce((flat, node) => [
  ...flat,
  { ...node, parentId, depth, childCount: (node.children || []).length },
  ...flattenTree(node.children || [], node.id, depth + 1),
], []);

/**
 * Flatten, but drop everything underneath the given ids. Used to hide the descendants of a
 * collapsed row, and of the row currently being dragged.
 *
 * @param {Array} nodes
 * @param {Array<number>} ids
 */
export const flattenVisible = (nodes, ids) => {
  const excluded = new Set(ids);
  const flat = flattenTree(nodes);
  const hidden = new Set();

  return flat.filter((item) => {
    if (hidden.has(item.parentId)) {
      hidden.add(item.id);
      return false;
    }

    if (excluded.has(item.id) && item.childCount > 0) {
      hidden.add(item.id);
    }

    return true;
  });
};

/**
 * The height of the subtree rooted at id, where a leaf is 1.
 *
 * @param {Array} nodes nested nodes
 * @param {number} id
 */
export const getSubtreeHeight = (nodes, id) => {
  const measure = (branch) => branch.reduce((max, node) => {
    if (node.id === id) {
      return Math.max(max, heightOf(node));
    }

    return Math.max(max, measure(node.children || []));
  }, 0);

  const heightOf = (node) => (node.children || []).reduce(
    (max, child) => Math.max(max, 1 + heightOf(child)),
    1
  );

  return measure(nodes) || 1;
};

/**
 * Find a node anywhere in the nested tree.
 *
 * @param {Array} nodes
 * @param {number} id
 * @returns {object|null}
 */
export const findNode = (nodes, id) => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return nodes[i];
    }

    const found = findNode(nodes[i].children || [], id);

    if (found) {
      return found;
    }
  }

  return null;
};

/**
 * Every id underneath id, not including it.
 */
export const getDescendantIds = (nodes, id) => {
  const node = findNode(nodes, id);

  if (!node) {
    return [];
  }

  const collect = (branch) => branch.reduce(
    (ids, child) => [...ids, child.id, ...collect(child.children || [])],
    []
  );

  return collect(node.children || []);
};

const getMaxDepthFor = (previousItem) => (previousItem ? previousItem.depth + 1 : 1);

const getMinDepthFor = (nextItem) => (nextItem ? nextItem.depth : 1);

/**
 * Work out where a dragged row would end up, given how far it has been dragged sideways.
 *
 * This mirrors the constraints the server enforces, so the drop indicator never promises a move
 * that would then be rejected: the depth limit, the subtree height, and whether the row that would
 * become the parent accepts children at all.
 *
 * @returns {{depth: number, parentId: number, allowed: boolean}}
 */
export const getProjection = (
  items,
  activeId,
  overId,
  dragOffset,
  indentationWidth,
  maxDepth,
  subtreeHeight
) => {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];

  if (!activeItem || overItemIndex === -1) {
    return { depth: 1, parentId: null, allowed: false };
  }

  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = Math.round(dragOffset / indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;

  const upperBound = getMaxDepthFor(previousItem);
  const lowerBound = getMinDepthFor(nextItem);

  let depth = Math.min(Math.max(projectedDepth, lowerBound), upperBound);

  // The whole subtree travels with the row, so the deepest descendant has to fit too
  if (maxDepth > 0) {
    depth = Math.min(depth, Math.max(1, maxDepth - (subtreeHeight - 1)));
  }

  const getParentId = () => {
    if (depth === 1 || !previousItem) {
      return null;
    }

    if (depth === previousItem.depth) {
      return previousItem.parentId;
    }

    if (depth > previousItem.depth) {
      return previousItem.id;
    }

    const closestParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth);

    return closestParent ? closestParent.parentId : null;
  };

  const parentId = getParentId();
  const parent = parentId ? items.find((item) => item.id === parentId) : null;

  // A row that cannot take children, or that the member cannot edit, is not a valid drop parent.
  // Nor is the top level, for a record type that is not allowed to live there.
  const allowed = parent
    ? Boolean(parent.allowsChildren && parent.canAddChildren)
    : activeItem.allowsRoot !== false;

  return {
    depth: allowed ? depth : Math.max(1, depth - 1),
    parentId: allowed ? parentId : (parent ? parent.parentId : null),
    allowed,
  };
};

/**
 * The index a row should take among its new siblings, given the flat order after the drag.
 */
export const getPositionAmongSiblings = (items, activeId, overId, parentId) => {
  const activeIndex = items.findIndex(({ id }) => id === activeId);
  const overIndex = items.findIndex(({ id }) => id === overId);
  const ordered = arrayMove(items, activeIndex, overIndex);

  const siblings = ordered.filter((item) => (
    item.id === activeId ? true : item.parentId === parentId
  ));

  // The dragged row's parentId in the flat list is still its old one, so match on id
  return Math.max(0, siblings.findIndex((item) => item.id === activeId));
};

/**
 * Interleave the rows with the dashed "add" affordances.
 *
 * One closes off the children of every row that can take them, and one closes off the tree. They
 * are not draggable, so they never join the sortable list.
 *
 * @param {Array} flat rows in display order
 * @param {boolean} canAddRoot
 * @returns {Array} entries of {type: 'node'|'adder', ...}
 */
export const withAdders = (flat, canAddRoot) => {
  const rows = [];

  flat.forEach((item, index) => {
    rows.push({ type: 'node', item });

    if (!item.canAddChildren || !item.allowsChildren) {
      return;
    }

    // The adder belongs after everything already nested under this row
    const next = flat.slice(index + 1).findIndex((other) => other.depth <= item.depth);
    const lastDescendant = next === -1 ? flat.length - 1 : index + next;

    rows.push({
      type: 'pending-adder',
      parentId: item.id,
      parentTitle: item.title,
      depth: item.depth + 1,
      after: flat[lastDescendant].id,
    });
  });

  // Move each adder to sit after the last row of the branch it belongs to
  const ordered = [];
  const pending = rows.filter((row) => row.type === 'pending-adder');

  rows
    .filter((row) => row.type === 'node')
    .forEach((row) => {
      ordered.push(row);

      // Deepest first, so each branch is closed off before the one containing it
      pending
        .filter((adder) => adder.after === row.item.id)
        .sort((a, b) => b.depth - a.depth)
        .forEach((adder) => ordered.push({ ...adder, type: 'adder' }));
    });

  if (canAddRoot) {
    ordered.push({ type: 'adder', parentId: null, depth: 1, after: null });
  }

  return ordered;
};

/**
 * Move a node, with everything under it, to a new parent and position.
 *
 * Applied locally as soon as a drag finishes so the row does not jump back to where it was while
 * the server catches up.
 */
export const moveNodeInTree = (nodes, id, parentId, position) => {
  let moved = null;

  const remove = (branch) => branch.reduce((kept, node) => {
    if (node.id === id) {
      moved = node;
      return kept;
    }

    return [...kept, { ...node, children: remove(node.children || []) }];
  }, []);

  const without = remove(nodes);

  if (!moved) {
    return nodes;
  }

  const insert = (branch, into) => {
    if (into === null) {
      const next = [...branch];
      next.splice(Math.max(0, Math.min(position, next.length)), 0, moved);
      return next;
    }

    return branch.map((node) => {
      if (node.id === into) {
        const children = [...(node.children || [])];
        children.splice(Math.max(0, Math.min(position, children.length)), 0, moved);
        return { ...node, children };
      }

      return { ...node, children: insert(node.children || [], into) };
    });
  };

  return insert(without, parentId ?? null);
};
