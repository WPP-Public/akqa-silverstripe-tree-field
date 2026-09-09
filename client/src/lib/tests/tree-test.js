import {
  flattenTree,
  flattenVisible,
  findNode,
  getDescendantIds,
  getSubtreeHeight,
  getProjection,
  getPositionAmongSiblings,
} from '../tree';

const node = (id, children = [], overrides = {}) => ({
  id,
  title: id,
  childCount: children.length,
  canEdit: true,
  canAddChildren: true,
  allowsChildren: true,
  allowsRoot: true,
  children,
  ...overrides,
});

// set-1 > item-1 > item-2, plus item-3, then set-2
const tree = [
  node('set-1', [
    node('item-1', [node('item-2')]),
    node('item-3'),
  ]),
  node('set-2'),
];

describe('flattenTree', () => {
  it('lists parents immediately before their descendants', () => {
    expect(flattenTree(tree).map(({ id }) => id))
      .toEqual(['set-1', 'item-1', 'item-2', 'item-3', 'set-2']);
  });

  it('records depth starting at one, and the parent of each row', () => {
    const flat = flattenTree(tree);

    expect(flat.find(({ id }) => id === 'set-1').depth).toBe(1);
    expect(flat.find(({ id }) => id === 'item-1').depth).toBe(2);
    expect(flat.find(({ id }) => id === 'item-2').depth).toBe(3);
    expect(flat.find(({ id }) => id === 'set-1').parentId).toBeNull();
    expect(flat.find(({ id }) => id === 'item-2').parentId).toBe('item-1');
  });
});

describe('flattenVisible', () => {
  it('hides the descendants of a collapsed row', () => {
    expect(flattenVisible(tree, ['item-1']).map(({ id }) => id))
      .toEqual(['set-1', 'item-1', 'item-3', 'set-2']);
  });

  it('hides descendants several levels down', () => {
    expect(flattenVisible(tree, ['set-1']).map(({ id }) => id))
      .toEqual(['set-1', 'set-2']);
  });
});

describe('tree lookups', () => {
  it('finds a node anywhere in the tree', () => {
    expect(findNode(tree, 'item-2').title).toBe('item-2');
    expect(findNode(tree, 'nope')).toBeNull();
  });

  it('collects every descendant id', () => {
    expect(getDescendantIds(tree, 'set-1')).toEqual(['item-1', 'item-2', 'item-3']);
    expect(getDescendantIds(tree, 'item-2')).toEqual([]);
  });

  it('measures the height of a subtree', () => {
    expect(getSubtreeHeight(tree, 'set-1')).toBe(3);
    expect(getSubtreeHeight(tree, 'item-1')).toBe(2);
    expect(getSubtreeHeight(tree, 'item-2')).toBe(1);
  });
});

describe('getProjection', () => {
  const flat = flattenTree(tree);
  const project = (activeId, overId, offset, maxDepth = 0, height = 1) => getProjection(
    flat, activeId, overId, offset, 24, maxDepth, height
  );

  it('keeps a row at its own depth when it has not moved sideways', () => {
    expect(project('item-3', 'item-1', 0).depth).toBe(2);
  });

  it('nests a row under the one above when dragged right', () => {
    // item-3 sits below item-2, which is at depth 3, so one indent makes it a sibling of item-2
    const result = project('item-3', 'item-3', 24);

    expect(result.depth).toBe(3);
    expect(result.parentId).toBe('item-1');
  });

  it('will not nest deeper than one level below the row above', () => {
    // However far the row is dragged, item-2 at depth 3 is the deepest possible parent
    const result = project('item-3', 'item-3', 240);

    expect(result.depth).toBe(4);
    expect(result.parentId).toBe('item-2');
  });

  it('respects the maximum depth, allowing for the height of the dragged branch', () => {
    // A two level branch cannot start at level 3 when the limit is 3
    expect(project('item-3', 'item-3', 48, 3, 2).depth).toBe(2);
  });

  it('refuses a parent that does not accept children', () => {
    const closedTree = [
      node('a'),
      node('b', [], { allowsChildren: false }),
      node('c'),
    ];
    const closedFlat = flattenTree(closedTree);
    const result = getProjection(closedFlat, 'c', 'c', 48, 24, 0, 1);

    expect(result.allowed).toBe(false);
  });

  it('refuses the top level for a row that is not allowed there', () => {
    const mixed = flattenTree([
      node('set-1', [node('item-1', [], { allowsRoot: false })]),
      node('set-2'),
    ]);

    // Dragged above the first set, the only landing place is the top level
    expect(getProjection(mixed, 'item-1', 'set-1', 0, 24, 0, 1).allowed).toBe(false);

    // Dropped against another set it is nested, which is allowed
    expect(getProjection(mixed, 'item-1', 'set-2', 0, 24, 0, 1)).toMatchObject({
      allowed: true,
      parentId: 'set-2',
    });
  });
});

describe('getPositionAmongSiblings', () => {
  const flat = flattenTree(tree);

  it('reports the index a row takes among its new siblings', () => {
    expect(getPositionAmongSiblings(flat, 'item-3', 'item-1', 'set-1')).toBe(0);
  });

  it('counts from zero at the top level', () => {
    expect(getPositionAmongSiblings(flat, 'set-2', 'set-1', null)).toBe(0);
  });
});
