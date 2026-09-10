import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TreeField from '../TreeField';

const urls = {
  tree: '/admin/tree-field/tree/menus/0',
  add: '/admin/tree-field/add/menus/0',
  move: '/admin/tree-field/move/menus/0',
  delete: '/admin/tree-field/delete/menus/0',
  schema: '/admin/tree-field/schema/nodeForm/menus/0',
  form: '/admin/tree-field/nodeForm/menus/0',
};

const labels = {
  singular: 'Menu',
  plural: 'Menus',
  addRoot: 'Add menu',
  addChild: 'Add a link inside this one',
};

const makeNode = (id, title, children = [], overrides = {}) => ({
  id,
  title,
  subtitle: `/${title.toLowerCase().replace(/ /g, '-')}`,
  icon: 'font-icon-link',
  badges: [],
  parentID: null,
  canEdit: true,
  canDelete: true,
  canAddChildren: true,
  allowsChildren: true,
  allowsRoot: true,
  children,
  ...overrides,
});

const treePayload = {
  nodes: [
    makeNode('set-1', 'Header', [
      makeNode('item-1', 'About us', [], { parentID: 'set-1', allowsRoot: false }),
      makeNode('item-2', 'Contact', [], { parentID: 'set-1', allowsRoot: false }),
    ]),
    makeNode('set-2', 'Footer'),
  ],
  maxDepth: 4,
  canAdd: true,
  labels,
};

const jsonResponse = (body, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
  statusText: '',
});

// Every row renders its own menu, so queries have to be scoped to the row under test
const rowFor = (title) => screen.getByText(title).closest('li');

const openRowMenu = async (user, title) => {
  const row = rowFor(title);
  await user.click(within(row).getByRole('button', { name: 'More actions' }));

  return row;
};

const renderField = (props = {}) => render(
  <TreeField
    urls={urls}
    securityID="token-123"
    maxDepth={4}
    labels={labels}
    showDetail
    canAdd
    {...props}
  />
);

describe('TreeField', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => jsonResponse(treePayload));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('shows each row on two lines, with where it points underneath', async () => {
    renderField();

    const row = (await screen.findByText('About us')).closest('li');

    expect(within(row).getByText('About us')).toHaveClass('tree-field__title');
    expect(within(row).getByText('/about-us')).toHaveClass('tree-field__subtitle');
  });

  it('loads the tree and renders every row', async () => {
    renderField();

    expect(await screen.findByText('Header')).toBeInTheDocument();
    expect(screen.getByText('About us')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(urls.tree, expect.objectContaining({ method: 'GET' }));
  });

  it('says so when the tree is empty', async () => {
    global.fetch = jest.fn(() => jsonResponse({ ...treePayload, nodes: [] }));
    renderField();

    expect(await screen.findByText('No menus yet')).toBeInTheDocument();
  });

  it('sends the security token with a change, and never with a read', async () => {
    const user = userEvent.setup();
    renderField();

    await screen.findByText('Header');
    await user.click(screen.getByRole('button', { name: labels.addRoot }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      urls.add,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-SecurityID': 'token-123' }),
      })
    ));

    const [readUrl, readOptions] = global.fetch.mock.calls[0];
    expect(readUrl).toBe(urls.tree);
    expect(readOptions.headers['X-SecurityID']).toBeUndefined();
  });

  it('adds at the top level with no parent', async () => {
    const user = userEvent.setup();
    renderField();

    await screen.findByText('Header');
    await user.click(screen.getByRole('button', { name: labels.addRoot }));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url]) => url === urls.add);
      expect(JSON.parse(call[1].body)).toEqual({ parentID: '', position: -1 });
    });
  });

  it('closes off each branch, and the tree, with its own add box', async () => {
    renderField();

    await screen.findByText('Header');

    expect(screen.getByRole('button', { name: 'Add inside Header' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add inside About us' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.addRoot })).toBeInTheDocument();
  });

  it('adds a child under the branch whose add box was pressed', async () => {
    const user = userEvent.setup();
    renderField();

    await screen.findByText('Header');
    await user.click(screen.getByRole('button', { name: 'Add inside Header' }));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url]) => url === urls.add);
      expect(JSON.parse(call[1].body).parentID).toBe('set-1');
    });
  });

  it('selects the newly created record', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((url) => (
      url === urls.add
        ? jsonResponse({ ...treePayload, createdID: 'set-2' }, 201)
        : jsonResponse(treePayload)
    ));

    renderField();
    await screen.findByText('Header');
    await user.click(screen.getByRole('button', { name: labels.addRoot }));

    await waitFor(() => expect(screen.getByTestId('form-builder'))
      .toHaveAttribute('data-schema-url', `${urls.schema}/set-2`));
  });

  it('loads the selected record into the detail panel', async () => {
    const user = userEvent.setup();
    renderField();

    await user.click(await screen.findByText('About us'));

    expect(screen.getByTestId('form-builder'))
      .toHaveAttribute('data-schema-url', `${urls.schema}/item-1`);
  });

  it('shows a prompt instead of a form when nothing is selected', async () => {
    renderField();

    expect(await screen.findByText('Select a menu to edit it')).toBeInTheDocument();
    expect(screen.queryByTestId('form-builder')).not.toBeInTheDocument();
  });

  it('collapses and expands a branch', async () => {
    const user = userEvent.setup();
    renderField();

    await screen.findByText('Header');
    await user.click(screen.getAllByRole('button', { name: 'Collapse' })[0]);

    expect(screen.queryByText('About us')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Expand' })[0]);

    expect(screen.getByText('About us')).toBeInTheDocument();
  });

  it('confirms before deleting a branch, and names what goes with it', async () => {
    const user = userEvent.setup();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);

    renderField();
    await screen.findByText('Header');

    const row = await openRowMenu(user, 'Header');
    await user.click(within(row).getByText('Delete'));

    expect(confirm).toHaveBeenCalledWith('Delete "Header" and everything under it?');
    expect(global.fetch.mock.calls.filter(([url]) => url.startsWith(urls.delete))).toHaveLength(0);

    confirm.mockRestore();
  });

  it('deletes when the prompt is accepted', async () => {
    const user = userEvent.setup();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderField();
    await screen.findByText('Header');

    const row = await openRowMenu(user, 'About us');
    await user.click(within(row).getByText('Delete'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      `${urls.delete}/item-1`,
      expect.objectContaining({ method: 'POST' })
    ));

    confirm.mockRestore();
  });

  it('moves a row down through the row menu', async () => {
    const user = userEvent.setup();
    renderField();

    await screen.findByText('Header');
    const row = await openRowMenu(user, 'About us');
    await user.click(within(row).getByText('Move down'));

    await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url]) => url === urls.move);
      expect(JSON.parse(call[1].body)).toEqual({
        nodeID: 'item-1',
        parentID: 'set-1',
        position: 1,
      });
    });
  });

  it('will not offer outdent to a row that cannot live at the top level', async () => {
    const user = userEvent.setup();
    renderField();

    await screen.findByText('Header');
    const row = await openRowMenu(user, 'About us');

    expect(within(row).getByText('Move out one level')).toBeDisabled();
  });

  it('reports a failed change without losing the tree', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((url) => (
      url === urls.add
        ? Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: () => Promise.resolve({ value: 'You cannot add menus' }),
        })
        : jsonResponse(treePayload)
    ));

    renderField();
    await screen.findByText('Header');
    await user.click(screen.getByRole('button', { name: labels.addRoot }));

    expect(await screen.findByText('You cannot add menus')).toBeInTheDocument();
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('hides every control when the field is readonly', async () => {
    renderField({ readonly: true });

    await screen.findByText('Header');

    expect(screen.queryByRole('button', { name: labels.addRoot })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add inside/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('does not offer to delete a record the member cannot delete', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(() => jsonResponse({
      ...treePayload,
      nodes: [makeNode('set-1', 'Header', [], { canDelete: false })],
    }));

    renderField();
    await screen.findByText('Header');
    const row = await openRowMenu(user, 'Header');

    expect(within(row).queryByText('Delete')).not.toBeInTheDocument();
  });

  it('marks the selected row for assistive technology', async () => {
    const user = userEvent.setup();
    renderField();

    const row = await screen.findByText('Footer');
    await user.click(row);

    expect(row.closest('button')).toHaveAttribute('aria-current', 'true');
  });
});
