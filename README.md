# Silverstripe Tree Field

A reusable form field for managing a hierarchy of records inside the Silverstripe CMS.

The tree sits on one side, the selected record's own `getCMSFields()` on the other. Records are
added, re-ordered, nested and deleted inline, without leaving the page and without a modal in the
way. Every structural change is written immediately and the server returns the whole tree, so what
is on screen matches the database.

It is not tied to any particular model. Point it at a `DataObject` class that references its own
parent and it works.

![Field layout: tree on the left, the selected record's CMS fields on the right]

## Requirements

* PHP 8.3+
* Silverstripe CMS 6 (`silverstripe/framework` ^6, `silverstripe/admin` ^3)

## Installation

```bash
composer require akqa/silverstripe-tree-field
```

## Quick start

Say you have a `Category` that can contain other categories, belonging to a `Catalogue`:

```php
class Category extends DataObject
{
    private static array $db = [
        'Title' => 'Varchar(255)',
        'Sort' => 'Int',
    ];

    private static array $has_one = [
        'Catalogue' => Catalogue::class,
        'ParentCategory' => Category::class,
    ];

    private static array $has_many = [
        'Children' => Category::class . '.ParentCategory',
    ];
}
```

**1. Describe the tree** with a source. Either subclass `DataObjectTreeSource`:

```php
use Akqa\SilverStripe\TreeField\Sources\DataObjectTreeSource;

class CategoryTreeSource extends DataObjectTreeSource
{
    private static string $key = 'categories';
    private static string $data_class = Category::class;
    private static string $parent_relation = 'ParentCategory';
    private static string $scope_relation = 'Catalogue';
    private static string $sort_field = 'Sort';
    private static int $max_depth = 3;
}
```

…or configure one through `Injector`, without writing a class:

```yaml
SilverStripe\Core\Injector\Injector:
  CategoryTreeSource:
    class: Akqa\SilverStripe\TreeField\Sources\DataObjectTreeSource
    properties:
      Key: categories
      DataClass: 'App\Model\Category'
      ParentRelation: ParentCategory
      ScopeRelation: Catalogue
      MaxDepth: 3
```

**2. Register the source** so requests can reach it:

```yaml
Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry:
  sources:
    categories: 'App\Model\CategoryTreeSource'
```

**3. Add the field:**

```php
use Akqa\SilverStripe\TreeField\Form\TreeField;

public function getCMSFields(): FieldList
{
    $fields = parent::getCMSFields();
    $fields->removeByName('Categories');

    if ($this->isInDB()) {
        $fields->addFieldToTab(
            'Root.Categories',
            TreeField::create('Categories', 'Categories', 'categories', (int) $this->ID)
        );
    }

    return $fields;
}
```

That is the whole integration. The detail panel renders `Category::getCMSFields()`, so every field
type the model already uses keeps working, including `TreeDropdownField` and upload fields.

## Trees that hold more than one class

Node identifiers are opaque strings, not record IDs, so a tree can mix classes. A source over a
single class just uses the record ID; a mixed tree prefixes them:

```php
public function getNodeID(DataObject $node): string
{
    return $node instanceof Catalogue ? "catalogue-{$node->ID}" : "category-{$node->ID}";
}
```

`allowsRoot()` then keeps each type at the level it belongs to, so a category can never be dragged
out to sit beside a catalogue. The client honours it while dragging, and the server enforces it
again on the way in.

`heyday/silverstripe-menumanager` uses this: its Menus section is one tree holding every menu set,
with that set's links nested underneath.

## Describing how records look in the tree

Rows fall back to `getTitle()` and a generic icon. To say more, implement `TreeNodeProvider`:

```php
use Akqa\SilverStripe\TreeField\Contracts\TreeNodeProvider;

class Category extends DataObject implements TreeNodeProvider
{
    public function getTreeNodeTitle(): string
    {
        return $this->Title ?: 'Untitled category';
    }

    public function getTreeNodeSubtitle(): ?string
    {
        return $this->Link();
    }

    public function getTreeNodeIcon(): ?string
    {
        return 'font-icon-link';
    }

    public function getTreeNodeBadges(): array
    {
        return $this->Hidden ? [['text' => 'Hidden', 'type' => 'warning']] : [];
    }

    public function allowsTreeChildren(): bool
    {
        return !$this->IsLeafType;
    }
}
```

The same methods are picked up from a Silverstripe `Extension`, so a module can describe records in
a class it does not own without depending on this one. Implementing the interface is optional.

Badge types are limited to `default`, `primary`, `secondary`, `info`, `success`, `warning` and
`danger`; anything else is coerced to `secondary`.

## Writing your own source

`DataObjectTreeSource` covers a single class with a self-referencing `has_one`. For anything else
(records spread across several classes, an external service, a `Hierarchy` extension with its own
rules) implement `Akqa\SilverStripe\TreeField\Contracts\TreeSource` directly. The interface is
documented method by method in [`src/Contracts/TreeSource.php`](src/Contracts/TreeSource.php).

The one rule an implementation must not break: **`getNode()` may only ever return records that
belong to this tree in its current scope.** That method is the security boundary for every
endpoint. If it can return a record from another owner, so can the delete endpoint.

## Security model

Requests reach `admin/tree-field/<action>/<sourceKey>/<scopeID>[/<recordID>]`.

* **Sources are named by key, never by class.** Only keys registered against `TreeSourceRegistry`
  resolve to anything, so a request cannot ask the field to operate on an arbitrary model.
* **Scope is resolved server side.** A scoped source filters on its owner column, and an unscoped
  request against a scoped source returns nothing rather than everything.
* **Node identifiers are resolved through the source.** The controller checks only their shape
  (`[A-Za-z0-9_-]{1,64}`) before handing them over. An identifier belonging to another owner, or
  naming another class, comes back as a 404 from read, move, delete and the edit form alike.
* **Permissions are checked per record, per operation**: `canView()` to appear in the tree,
  `canCreate()` to add, `canEdit()` to move (including every sibling whose sort position shifts),
  `canDelete()` for the record *and every descendant* before a branch is removed. A scoped tree
  additionally requires `canEdit()` on the record that owns it before anything can be added.
* **Every mutating request carries the CMS security token**, sent in the `X-SecurityID` header and
  checked with `SecurityToken::checkRequest()`.
* **Structure cannot be changed through the edit form.** The columns named by the source's
  `getProtectedFields()` (parent, sort and scope) are rejected if they appear in a form
  submission, so a crafted payload cannot re-parent a record while side-stepping the cycle and
  depth checks.
* **Moves are validated server side**: a record cannot become its own descendant, and a move that
  would push the deepest leaf of the dragged branch past `max_depth` is refused.

The controller requires the `CMS_ACCESS` permission as a baseline. Everything beyond that is
decided by the model's own `can*()` methods.

## Configuration reference

`DataObjectTreeSource` config, all settable as private statics on a subclass or as Injector
properties:

| Setting | Default | Meaning |
| --- | --- | --- |
| `key` | *(required)* | URL safe identifier, `[a-z0-9-]+` |
| `data_class` | *(required)* | The `DataObject` class in the tree |
| `parent_relation` | `Parent` | `has_one` name pointing at the parent. Empty for a flat list |
| `sort_field` | `Sort` | Column holding sibling order |
| `scope_relation` | *(none)* | `has_one` name of the record that owns the tree |
| `max_depth` | `0` | Deepest level allowed. `1` is a flat list, `0` is unlimited |
| `default_icon` | `font-icon-menu` | Icon for records that do not supply one |

`TreeField` methods: `setSourceKey()`, `setScopeID()`, `setScopeRecord()`, `setShowDetail()`.
Setting `showDetail` to false gives a tree that can be restructured but not edited in place.

## Accessibility

Dragging is the quick path, never the only one. Every row carries a menu with move up, move down,
indent and outdent, all of which go through the same endpoint as a drag. Rows are buttons, the
drag handle is a button with `dnd-kit`'s keyboard sensor attached, collapse state is exposed with
`aria-expanded`, and results are announced through a polite live region.

## Building the client

The field ships with a compiled bundle in `client/dist`, so a normal install needs no build step.
To work on the JavaScript:

```bash
npm install
npm run build    # or: npm run watch
npm test         # jest, with the CMS components mocked
npm run lint
```

The build uses `@silverstripe/webpack-config`, which externalises React, Reactstrap and the CMS's
own components so they are shared with `silverstripe/admin` rather than duplicated.

## Testing

```bash
composer test   # PHPUnit, run from a Silverstripe project
npm test        # Jest
```

The PHP suite covers the source contract and the request boundary: scope isolation, permission
checks per operation, cycle and depth rejection, the security token, and the fields the edit form
may not write. The JavaScript suite covers the drag projection maths and the component itself,
with the CMS's own components mocked.

## Known limitations

* Unsaved changes in the detail panel are detected at the DOM level. Switching rows asks before
  discarding, but a field that never fires an `input` or `change` event will not be noticed.
* Versioned records are deleted rather than archived. Implement `deleteNode()` in your own source
  if you need `doArchive()`.

## Licence

MIT. See [LICENSE](LICENSE).
