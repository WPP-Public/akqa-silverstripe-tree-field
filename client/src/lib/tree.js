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
