import {
  withAdders,
  moveNodeInTree,
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

describe('withAdders', () => {
  it('closes off every branch that takes children, and the tree itself', () => {
    const rows = withAdders(flattenTree(tree), true);

    expect(rows.map((row) => (row.type === 'node' ? row.item.id : `add:${row.parentId ?? 'root'}`)))
      .toEqual([
        'set-1',
        'item-1',
        'item-2',
        'add:item-2',
        'add:item-1',
        'item-3',
        'add:item-3',
        'add:set-1',
        'set-2',
        'add:set-2',
        'add:root',
      ]);
  });

  it('leaves out the root adder when the member cannot add there', () => {
    const rows = withAdders(flattenTree(tree), false);

    expect(rows.filter((row) => row.type === 'adder' && row.parentId === null)).toHaveLength(0);
  });

  it('skips rows that cannot take children', () => {
    const flat = flattenTree([node('a', [], { allowsChildren: false })]);

    expect(withAdders(flat, false).filter((row) => row.type === 'adder')).toHaveLength(0);
  });

  it('names each adder after the branch it belongs to', () => {
    const rows = withAdders(flattenTree(tree), false);
    const adder = rows.find((row) => row.type === 'adder' && row.parentId === 'set-1');

    expect(adder.parentTitle).toBe('set-1');
    expect(adder.depth).toBe(2);
  });
});

describe('moveNodeInTree', () => {
  it('reorders within the same parent', () => {
    const moved = moveNodeInTree(tree, 'item-3', 'set-1', 0);

    expect(moved[0].children.map((n) => n.id)).toEqual(['item-3', 'item-1']);
  });

  it('moves a branch to another parent, children and all', () => {
    const moved = moveNodeInTree(tree, 'item-1', 'set-2', 0);

    expect(moved[0].children.map((n) => n.id)).toEqual(['item-3']);
    expect(moved[1].children[0].id).toBe('item-1');
    expect(moved[1].children[0].children[0].id).toBe('item-2');
  });

  it('moves a row to the top level', () => {
    const moved = moveNodeInTree(tree, 'item-3', null, 0);

    expect(moved.map((n) => n.id)).toEqual(['item-3', 'set-1', 'set-2']);
  });

  it('leaves the tree alone when the row is not in it', () => {
    expect(moveNodeInTree(tree, 'nope', null, 0)).toBe(tree);
  });

  it('clamps a position past the end of the list', () => {
    const moved = moveNodeInTree(tree, 'set-2', null, 99);

    expect(moved.map((n) => n.id)).toEqual(['set-1', 'set-2']);
  });
});
