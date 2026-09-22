import React from 'react';
import { act, render, screen } from '@testing-library/react';
import TreeDetail from '../TreeDetail';

let mockSubmitResult;

// Stands in for the CMS form schema loader, with a Save that submits the way FormBuilder does:
// through onSubmit, handing over the function that actually posts the form
jest.mock('containers/FormBuilderLoader/FormBuilderLoader', () => {
  const MockReact = jest.requireActual('react');

  return ({ identifier, schemaUrl, onSubmit }) => MockReact.createElement(
    'button',
    {
      type: 'button',
      'data-identifier': identifier,
      'data-schema-url': schemaUrl,
      onClick: () => onSubmit({}, 'action_save', () => mockSubmitResult()).catch(() => null),
    },
    'Save'
  );
});

const renderDetail = (props = {}) => render(
  <TreeDetail
    schemaUrl="admin/tree-field/schema/nodeForm/menu-items/6/"
    nodeId="147"
    nodeTitle="Careers"
    onSaved={() => null}
    onDirtyChange={() => null}
    emptyMessage="Select something"
    {...props}
  />
);

describe('TreeDetail', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the record\'s form without doubling a trailing slash', () => {
    renderDetail();

    expect(screen.getByText('Save')).toHaveAttribute(
      'data-schema-url',
      'admin/tree-field/schema/nodeForm/menu-items/6/147'
    );
  });

  it('names the form so redux-form does not read the record ID as an array index', () => {
    renderDetail();

    expect(screen.getByText('Save')).toHaveAttribute('data-identifier', 'TreeField.NodeForm_147');
  });

  it('says it is saving, then that it saved, then gets out of the way', async () => {
    let finish;
    mockSubmitResult = () => new Promise((resolve) => { finish = resolve; });
    const onSaved = jest.fn();

    renderDetail({ onSaved });

    act(() => screen.getByText('Save').click());
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');

    await act(async () => finish({ id: 'saved' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(onSaved).toHaveBeenCalledWith({ id: 'saved' });

    act(() => jest.advanceTimersByTime(3000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so when the save fails', async () => {
    mockSubmitResult = () => Promise.reject(new Error('Validation failed'));
    const onSaved = jest.fn();

    renderDetail({ onSaved });

    await act(async () => screen.getByText('Save').click());

    expect(screen.getByRole('status')).toHaveTextContent('Not saved');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
