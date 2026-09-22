import isolateForms, { ENTWINE_SUBMIT_EVENT } from '../isolateForms';

/**
 * The field mounted inside a CMS edit form: outer form > container > the detail panel's own form.
 *
 * silverstripe/admin is stood in for by listeners at the document, where its delegated handlers
 * live, and by entwine's handler bound directly on the nested form, which hands the submit to the
 * outer form and cancels it. React is stood in for by a listener on the container, where
 * createRoot() attaches its own.
 */
describe('isolateForms', () => {
  let outer;
  let container;
  let inner;
  let button;
  let release;
  let seen;

  const record = (name) => (event) => seen.push(`${name}:${event.type}`);
  const atDocument = record('document');

  // What entwine binds on every form: re-dispatch to the CMS, then cancel the event outright
  const entwineSubmit = (event) => {
    seen.push('entwine:submit');
    event.preventDefault();
    event.stopPropagation();
  };

  // Enough of jQuery for isolateForms, which only ever unbinds entwine's handler
  const $ = (element) => ({
    off: (eventName) => {
      if (eventName === ENTWINE_SUBMIT_EVENT) {
        element.removeEventListener('submit', entwineSubmit);
      }
    },
  });

  beforeEach(() => {
    seen = [];

    // Built by hand: the HTML parser drops a form nested in another, but the DOM allows it and
    // that is what React produces
    outer = document.createElement('form');
    outer.className = 'cms-edit-form';
    outer.innerHTML = '<button type="submit" name="action_save" id="outer-save">Save menu</button>';

    container = document.createElement('div');

    inner = document.createElement('form');
    inner.innerHTML = `
      <input type="text" name="MenuTitle" />
      <div class="btn-toolbar">
        <button type="submit" class="action" name="action_save">Save</button>
      </div>
    `;

    container.appendChild(inner);
    outer.appendChild(container);
    document.body.replaceChildren(outer);
    button = inner.querySelector('button');

    inner.addEventListener('submit', entwineSubmit);
    outer.addEventListener('submit', (event) => event.preventDefault());

    // React's listeners, registered on the root before anything else is
    container.addEventListener('click', record('react'));
    container.addEventListener('submit', (event) => {
      event.preventDefault();
      record('react')(event);
    });

    document.addEventListener('click', atDocument);
    document.addEventListener('submit', atDocument);

    release = isolateForms(container, $);
  });

  afterEach(() => {
    release();
    document.removeEventListener('click', atDocument);
    document.removeEventListener('submit', atDocument);
  });

  it('hands the nested form\'s submit to React, and not to entwine or the CMS', () => {
    expect(button.form).toBe(inner);

    button.click();

    expect(seen).toEqual(['react:click', 'react:submit']);
  });

  it('keeps working on the next save', () => {
    button.click();
    button.click();

    expect(seen).toEqual(['react:click', 'react:submit', 'react:click', 'react:submit']);
  });

  it('leaves the surrounding form alone', () => {
    document.getElementById('outer-save').click();

    expect(seen).toEqual(['document:click', 'document:submit']);
  });

  it('leaves clicks that are not on a button alone', () => {
    inner.querySelector('input').click();

    expect(seen).toEqual(['react:click', 'document:click']);
  });

  it('without it, entwine swallows the submit before React sees it', () => {
    release();

    button.click();

    expect(seen).toEqual(['react:click', 'document:click', 'entwine:submit']);
  });
});
