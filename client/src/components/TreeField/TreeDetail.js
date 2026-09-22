import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import FormBuilderLoader from 'containers/FormBuilderLoader/FormBuilderLoader';
import i18n from 'i18n';
import joinUrl from '../../lib/joinUrl';

/**
 * The panel beside the tree. It renders the selected record's own getCMSFields() through the
 * CMS form schema, so any field type the record already uses keeps working here.
 */
/**
 * How long "Saved" or "Not saved" stays up, in milliseconds.
 */
const STATUS_DURATION = 3000;

const TreeDetail = ({
  schemaUrl,
  nodeId = null,
  nodeTitle = '',
  onSaved,
  onDirtyChange,
  emptyMessage,
  offsetTop = 0,
}) => {
  // 'saving' while the request is out, then 'saved' or 'failed' for a moment so the member can
  // see the save happened: the panel stays where it is rather than reloading
  const [status, setStatus] = useState(null);
  const wrapperRef = useRef(null);
  const clearStatusRef = useRef(null);

  // Read back by the stylesheet, which only applies it once the two columns sit side by side
  const style = { '--tree-field-detail-offset': `${offsetTop}px` };

  // Reset the dirty flag and any status whenever the selection changes
  useEffect(() => {
    onDirtyChange(false);
    setStatus(null);
  }, [nodeId, onDirtyChange]);

  useEffect(() => () => window.clearTimeout(clearStatusRef.current), []);

  const showStatus = useCallback((next) => {
    window.clearTimeout(clearStatusRef.current);
    setStatus(next);

    if (next !== 'saving') {
      clearStatusRef.current = window.setTimeout(() => setStatus(null), STATUS_DURATION);
    }
  }, []);

  const handleInput = useCallback(() => {
    onDirtyChange(true);
  }, [onDirtyChange]);

  const handleSubmit = useCallback((data, action, submitFn) => {
    showStatus('saving');

    return submitFn()
      .then((response) => {
        onDirtyChange(false);
        onSaved(response);
        showStatus('saved');
        return response;
      })
      .catch((error) => {
        showStatus('failed');
        throw error;
      });
  }, [onSaved, onDirtyChange, showStatus]);

  if (!nodeId) {
    return (
      <div className="tree-field__detail tree-field__detail--empty" style={style}>
        <p className="tree-field__detail-empty-text">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="tree-field__detail" style={style}>
      <div className="tree-field__detail-header">
        <h3 className="tree-field__detail-title">{nodeTitle}</h3>
        {status && (
          <span
            className={`tree-field__detail-status tree-field__detail-status--${status}`}
            role="status"
          >
            {status === 'saving' && i18n._t('TreeField.SAVING', 'Saving…')}
            {status === 'saved' && i18n._t('TreeField.SAVED', 'Saved')}
            {status === 'failed' && i18n._t('TreeField.NOT_SAVED', 'Not saved')}
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
          // Not a path segment of its own: redux-form reads dots as a path, and a numeric segment
          // would store the form in an array as long as the record's ID
          identifier={`TreeField.NodeForm_${nodeId}`}
          schemaUrl={joinUrl(schemaUrl, nodeId)}
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
  offsetTop: PropTypes.number,
};


export default TreeDetail;
