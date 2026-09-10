import React from 'react';
import PropTypes from 'prop-types';
import i18n from 'i18n';

/**
 * The dashed box that closes off a branch, and the tree itself.
 *
 * Adding sits at the end of the list it adds to, rather than on every row, so a row carries only
 * the thing it is.
 */
const TreeAdder = ({
    parentId,
    parentTitle,
    depth,
    indentationWidth,
    label,
    onAdd,
    disabled,
}) => {
    // Every branch has one of these, so a shared name would leave them indistinguishable
    const accessibleName = parentTitle
        ? i18n.inject(i18n._t('TreeField.ADD_INSIDE', 'Add inside {title}'), { title: parentTitle })
        : label;

    return (
    <li
        className="tree-field__adder"
        style={{ paddingInlineStart: `${(depth - 1) * indentationWidth}px` }}
    >
        <button
            type="button"
            className="tree-field__adder-button"
            aria-label={accessibleName}
            title={accessibleName}
            onClick={() => onAdd(parentId)}
            disabled={disabled}
        >
            <span className="font-icon-plus-circled" aria-hidden="true" />
            <span className="tree-field__adder-label">{label}</span>
        </button>
    </li>
    );
};

TreeAdder.propTypes = {
    parentId: PropTypes.string,
    parentTitle: PropTypes.string,
    depth: PropTypes.number.isRequired,
    indentationWidth: PropTypes.number.isRequired,
    label: PropTypes.string.isRequired,
    onAdd: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

export default TreeAdder;
