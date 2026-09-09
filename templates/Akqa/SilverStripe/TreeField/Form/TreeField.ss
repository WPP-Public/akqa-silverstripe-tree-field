<%-- Bootstraps the TreeField React component. --%>
<%-- Rendered directly when the surrounding form is plain HTML rather than a form schema; the --%>
<%-- entwine wrapper in client/src/legacy picks this up and mounts the same component React --%>
<%-- would have mounted. --%>
<input $AttributesHTML />
<div
    class="tree-field entwine-treefield"
    data-field-id="$ID"
    data-schema-component="$SchemaComponent"
>
    <div class="tree-field__loading" role="status">
        <span class="tree-field__loading-text"><%t Akqa\SilverStripe\TreeField\Form\TreeField.LOADING 'Loading&hellip;' %></span>
    </div>
</div>
