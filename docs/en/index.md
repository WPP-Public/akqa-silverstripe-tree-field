# Tree Field

Start with the [README](../../README.md) for installation and a worked example.

This page covers the parts that need more room than a readme: writing a source from scratch, and
what each hook is responsible for.

## When to write your own source

`DataObjectTreeSource` assumes one class, one self-referencing `has_one`, one sort column and an
optional owner. Reach for a custom `TreeSource` when any of that stops being true:

* the tree mixes several classes, e.g. a folder type and a leaf type
* order comes from somewhere other than an integer column
* records are not `DataObject`s at all, but come from an API
* moving a record has side effects the generic re-sorter should not perform

## The contract

```php
use Akqa\SilverStripe\TreeField\Contracts\TreeSource;

class TaxonomyTreeSource implements TreeSource
{
    // …
}
```

Each method's job, in the order the field calls them:

| Method | Responsibility |
| --- | --- |
| `getKey()` | The identifier used in URLs. Must match `[a-z0-9][a-z0-9-]*` |
| `setScopeID()` / `getScopeID()` | Remember which owner this instance is serving |
| `getScopeRecord()` | The owner record, or null for a global tree |
| `canView()` | Whether the current member may see this tree at all |
| `getTree()` | The whole tree as nested arrays, filtered to what the member can view |
| `getNode()` | Resolve one identifier **within this scope**, or null |
| `getNodeID()` | The identifier for a record. Prefix it when the tree holds several classes |
| `allowsRoot()` | Whether a record may sit at the top level |
| `getNodeData()` | The per-row payload: title, subtitle, icon, badges, permission flags |
| `canAddChildren()` | Whether a child may be added under a record, or at the top level |
| `createNode()` | Build and persist a new record |
| `moveNode()` | Re-parent and re-order, rejecting cycles and depth violations |
| `deleteNode()` | Remove a record and everything under it |
| `getNodeDepth()` / `getNodeHeight()` | Feed the depth limit |
| `getNodeForm()` | The detail panel form, normally from `DefaultFormFactory` |
| `getProtectedFields()` | Columns the detail form must never write |
| `getLabels()` | UI strings: `singular`, `plural`, `addRoot`, `addChild`, `newTitle`, `untitled` |

## Two things a source must get right

**`getNode()` is the security boundary.** The controller checks only that an identifier has a
sane shape before handing it over; it does not filter by class or owner. Every mutating endpoint
resolves its target through this one method, so if it can return a record outside the tree, the
delete endpoint can delete that record. Filter on scope inside the method, not in the caller.

**Permission checks belong in the source, not the UI.** `getNodeData()` returns `canEdit`,
`canDelete` and `canAddChildren` so the client can grey out controls, but those flags are a
convenience. `createNode()`, `moveNode()` and `deleteNode()` must check again, because a request
can arrive without ever having rendered the UI.

## Throwing from a mutation

`createNode()`, `moveNode()` and `deleteNode()` signal refusal by throwing:

* `LogicException` becomes a 403
* `ValidationException` becomes a 400

Anything else propagates as a 500.

## Extending the generic source

Most of the time a subclass of `DataObjectTreeSource` plus one or two overrides is enough:

```php
class CategoryTreeSource extends DataObjectTreeSource
{
    private static string $key = 'categories';
    private static string $data_class = Category::class;
    private static string $parent_relation = 'ParentCategory';

    /**
     * Give new records a usable label before the member has filled the form in.
     */
    protected function extendNewNode(DataObject $node, ?DataObject $parent): void
    {
        $node->Title = 'New category';
        $node->CatalogueID = $this->getScopeID();
    }

    /**
     * Archive rather than delete, for versioned records.
     */
    public function deleteNode(DataObject $node): void
    {
        foreach (array_reverse($this->getSubtree($node)) as $record) {
            if (!$record->canDelete()) {
                throw new LogicException('Cannot delete this node');
            }

            $record->doArchive();
        }
    }
}
```

## Client side

The React component is registered with the CMS Injector under the name `TreeField`, which is what
`TreeField::$schemaComponent` points at. Replace it wholesale with a customisation:

```js
Injector.component.registerMany({ TreeField: MyTreeField });
```

or wrap it:

```js
Injector.transform('my-tree-field', (updater) => {
  updater.component('TreeField', myEnhancer);
});
```
