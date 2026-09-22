import joinUrl from '../joinUrl';

describe('joinUrl', () => {
  it('appends a segment', () => {
    expect(joinUrl('admin/tree-field/schema/nodeForm/menu-items/6', 147))
      .toBe('admin/tree-field/schema/nodeForm/menu-items/6/147');
  });

  it('does not double the slash when the server adds a trailing one', () => {
    expect(joinUrl('admin/tree-field/schema/nodeForm/menu-items/6/', '147'))
      .toBe('admin/tree-field/schema/nodeForm/menu-items/6/147');
  });
});
