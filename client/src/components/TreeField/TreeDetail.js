import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import FormBuilderLoader from 'containers/FormBuilderLoader/FormBuilderLoader';
import i18n from 'i18n';

/**
 * The panel beside the tree. It renders the selected record's own getCMSFields() through the
 * CMS form schema, so any field type the record already uses keeps working here.
 */
const TreeDetail = ({ schemaUrl, nodeId, nodeTitle, onSaved, onDirtyChange, emptyMessage }) => {
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef(null);

  // Reset the dirty flag whenever the selection changes
  useEffect(() => {
    onDirtyChange(false);
  }, [nodeId, onDirtyChange]);

  const handleInput = useCallback(() => {
    onDirtyChange(true);
  }, [onDirtyChange]);

  const handleSubmit = useCallback((data, action, submitFn) => {
    setSaving(true);

    return submitFn()
      .then((response) => {
        onDirtyChange(false);
        onSaved(response);
        return response;
      })
      .finally(() => setSaving(false));
  }, [onSaved, onDirtyChange]);

  if (!nodeId) {
    return (
      <div className="tree-field__detail tree-field__detail--empty">
        <p className="tree-field__detail-empty-text">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="tree-field__detail">
      <div className="tree-field__detail-header">
        <h3 className="tree-field__detail-title">{nodeTitle}</h3>
        {saving && (
          <span className="tree-field__detail-status" role="status">
            {i18n._t('TreeField.SAVING', 'Saving…')}
          </span>
        )}
      </div>
      <div
        className="tree-field__detail-body"
        ref={wrapperRef}
        onInput={handleInput}
        onChange={handleInput}
      >
        <FormBuilderLoader
          identifier={`TreeField.NodeForm.${nodeId}`}
          schemaUrl={`${schemaUrl}/${nodeId}`}
          refetchSchemaOnMount
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};

TreeDetail.propTypes = {
  schemaUrl: PropTypes.string.isRequired,
  nodeId: PropTypes.string,
  nodeTitle: PropTypes.string,
  onSaved: PropTypes.func.isRequired,
  onDirtyChange: PropTypes.func.isRequired,
  emptyMessage: PropTypes.string.isRequired,
};

TreeDetail.defaultProps = {
  nodeId: null,
  nodeTitle: '',
};

export default TreeDetail;
