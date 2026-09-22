/**
 * The namespace silverstripe/admin's entwine binds its submit handler under, directly on every
 * form added to the page.
 */
export const ENTWINE_SUBMIT_EVENT = 'submit.entwine_delegate_submit';

/**
 * Keep the detail panel's form to itself when the field sits inside a plain HTML CMS form.
 *
 * The detail panel is a React form nested inside the CMS edit form, and silverstripe/admin gets
 * in its way twice:
 *
 *  - it listens at the document for clicks on ".cms-edit-form .btn-toolbar button.action", which
 *    matches the panel's Save too, and answers by cancelling the click and posting the
 *    surrounding form instead;
 *  - entwine binds a submit handler directly on every form, the nested one included, which hands
 *    the submit to the surrounding ".cms-edit-form" and then cancels it. Because that handler sits
 *    on the form itself it runs before the event can bubble to React, which listens on the
 *    container, so the panel's form never saves and nothing appears to happen.
 *
 * Clicks on the panel's buttons are stopped at the container, which still lets React's own
 * listeners on that element see them. Entwine's handler is taken off the nested form as its submit
 * passes the container on the way down, before it reaches the form.
 *
 * @param {HTMLElement} container The element React is mounted on
 * @param {Function} $ jQuery, whose handlers entwine binds
 * @returns {Function} Removes the listeners again
 */
const isolateForms = (container, $) => {
  const isNestedForm = (form) => !!form && form !== container && container.contains(form);

  const onClick = (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest('button, input[type="submit"], input[type="image"]')
      : null;

    if (target && isNestedForm(target.form)) {
      event.stopPropagation();
    }
  };

  const onSubmitCapture = (event) => {
    if (isNestedForm(event.target) && $) {
      $(event.target).off(ENTWINE_SUBMIT_EVENT);
    }
  };

  const onSubmit = (event) => {
    if (isNestedForm(event.target)) {
      event.stopPropagation();
    }
  };

  container.addEventListener('click', onClick);
  container.addEventListener('submit', onSubmitCapture, true);
  container.addEventListener('submit', onSubmit);

  return () => {
    container.removeEventListener('click', onClick);
    container.removeEventListener('submit', onSubmitCapture, true);
    container.removeEventListener('submit', onSubmit);
  };
};

export default isolateForms;
