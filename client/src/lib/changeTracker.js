/**
 * Everything the field renders, as the CMS change tracker's selectors see it.
 */
export const TREE_FIELD_INPUTS = '.tree-field :input';

/**
 * Leave the field out of the surrounding CMS form's unsaved changes.
 *
 * The tree and its detail panel write their own records as they change, so nothing in them is
 * waiting on the surrounding form's Save. Left in, editing a record in the panel marks the whole
 * form as changed, and the CMS asks to discard those changes on leaving the page even after
 * they have been saved.
 *
 * @param {object} options The change tracker options of the surrounding form
 * @returns {object} A copy with the field's inputs ignored
 */
export const ignoreTreeFields = (options = {}) => {
  const ignored = options.ignoreFieldSelector || '';

  if (ignored.split(',').map((selector) => selector.trim()).includes(TREE_FIELD_INPUTS)) {
    return options;
  }

  return {
    ...options,
    ignoreFieldSelector: ignored ? `${ignored}, ${TREE_FIELD_INPUTS}` : TREE_FIELD_INPUTS,
  };
};

/**
 * Carry the detail panel's unsaved edits over to the surrounding CMS form.
 *
 * With the field's inputs ignored, the CMS would let the member leave with edits still sitting in
 * the panel. While there are some, mark the form as changed so the CMS asks first. Once they are
 * saved or thrown away, have the change tracker look at the form's own fields again rather than
 * clearing the mark outright, which could hide changes made elsewhere in the form.
 *
 * @param {object} $form The surrounding form, wrapped in jQuery
 * @param {boolean} dirty Whether the panel has unsaved edits
 */
export const reflectDirtyState = ($form, dirty) => {
  if (!$form || !$form.length) {
    return;
  }

  if (dirty) {
    $form.addClass('changed');
  } else {
    $form.trigger('change');
  }
};
