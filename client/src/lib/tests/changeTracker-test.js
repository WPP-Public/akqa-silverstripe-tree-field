import { ignoreTreeFields, reflectDirtyState, TREE_FIELD_INPUTS } from '../changeTracker';

describe('ignoreTreeFields', () => {
  it('adds the field to what the form already ignores', () => {
    const options = { ignoreFieldSelector: '.no-change-track', changedCssClass: 'changed' };

    expect(ignoreTreeFields(options)).toEqual({
      ignoreFieldSelector: `.no-change-track, ${TREE_FIELD_INPUTS}`,
      changedCssClass: 'changed',
    });
  });

  it('works when the form ignores nothing yet', () => {
    expect(ignoreTreeFields({ ignoreFieldSelector: '' }).ignoreFieldSelector).toBe(TREE_FIELD_INPUTS);
    expect(ignoreTreeFields().ignoreFieldSelector).toBe(TREE_FIELD_INPUTS);
  });

  it('does not add the field twice', () => {
    const once = ignoreTreeFields({ ignoreFieldSelector: '.no-change-track' });

    expect(ignoreTreeFields(once)).toBe(once);
  });

  it('leaves the options it was given alone', () => {
    const options = { ignoreFieldSelector: '.no-change-track' };
    ignoreTreeFields(options);

    expect(options.ignoreFieldSelector).toBe('.no-change-track');
  });

  it('covers every input the field renders, including the detail panel', () => {
    expect(TREE_FIELD_INPUTS).toBe('.tree-field :input');
  });
});

describe('reflectDirtyState', () => {
  const fakeForm = () => ({
    length: 1,
    addClass: jest.fn(),
    trigger: jest.fn(),
  });

  it('marks the form as changed while the panel has unsaved edits', () => {
    const $form = fakeForm();
    reflectDirtyState($form, true);

    expect($form.addClass).toHaveBeenCalledWith('changed');
    expect($form.trigger).not.toHaveBeenCalled();
  });

  it('has the change tracker look again, rather than clearing the mark, once they are gone', () => {
    const $form = fakeForm();
    reflectDirtyState($form, false);

    expect($form.trigger).toHaveBeenCalledWith('change');
    expect($form.addClass).not.toHaveBeenCalled();
  });

  it('does nothing outside a CMS form', () => {
    expect(() => reflectDirtyState({ length: 0 }, true)).not.toThrow();
    expect(() => reflectDirtyState(null, true)).not.toThrow();
  });
});
