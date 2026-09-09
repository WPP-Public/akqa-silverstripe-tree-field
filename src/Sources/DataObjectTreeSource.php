<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Sources;

use Akqa\SilverStripe\TreeField\Contracts\TreeNodeProvider;
use Akqa\SilverStripe\TreeField\Contracts\TreeSource;
use LogicException;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;
use SilverStripe\Forms\DefaultFormFactory;
use SilverStripe\Forms\Form;
use SilverStripe\ORM\DataList;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\Security;

/**
 * A TreeSource backed by a single DataObject class that points at its own parent through a
 * has_one, which covers the large majority of hierarchies in a Silverstripe project.
 *
 * Configure it either by subclassing, or through Injector:
 *
 * <code>
 * SilverStripe\Core\Injector\Injector:
 *   MyItemTree:
 *     class: Akqa\SilverStripe\TreeField\Sources\DataObjectTreeSource
 *     properties:
 *       Key: my-items
 *       DataClass: My\Item
 *       ParentRelation: Parent
 *       ScopeRelation: Owner
 *       MaxDepth: 3
 * </code>
 */
class DataObjectTreeSource implements TreeSource
{
    use Injectable;
    use Configurable;

    /**
     * Guards against a corrupt parent chain sending the walker into an endless loop.
     */
    private const MAX_ANCESTOR_WALK = 100;

    private static string $key = '';

    private static string $data_class = '';

    /**
     * has_one relation name pointing at the parent record, without the "ID" suffix.
     * Leave empty for a flat, single level list.
     */
    private static string $parent_relation = 'Parent';

    private static string $sort_field = 'Sort';

    /**
     * has_one relation name pointing at the record that owns the whole tree, without the "ID"
     * suffix. Leave empty when the tree covers every record of the class.
     */
    private static string $scope_relation = '';

    /**
     * Deepest level a node may sit at, where 1 is a flat list. Zero means unlimited.
     */
    private static int $max_depth = 0;

    private static string $default_icon = 'font-icon-menu';

    /**
     * Instance level overrides, normally set through Injector properties. Each falls back to the
     * class config when null, so a subclass can configure itself with private statics while an
     * Injector service configures itself with setters, without the two treading on each other.
     */
    private ?string $keyOverride = null;

    private ?string $dataClass = null;

    private ?string $parentRelation = null;

    private ?string $scopeRelation = null;

    private ?string $sortField = null;

    private ?int $maxDepth = null;

    private ?int $scopeID = null;

    private ?DataObject $scopeRecord = null;

    /**
     * All in-scope records, keyed by ID. Populated lazily and reset after every write.
     *
     * @var array<int, DataObject>|null
     */
    private ?array $records = null;

    public function getKey(): string
    {
        $key = $this->keyOverride ?? (string) $this->config()->get('key');

        if (!preg_match('/^[a-z0-9][a-z0-9\-]*$/', $key)) {
            throw new LogicException(sprintf(
                '%s needs a "key" made up of lowercase letters, numbers and hyphens, got "%s"',
                static::class,
                $key
            ));
        }

        return $key;
    }

    public function setKey(string $key): static
    {
        $this->keyOverride = $key;

        return $this;
    }

    public function getDataClass(): string
    {
        $class = $this->dataClass ?? (string) $this->config()->get('data_class');

        if (!is_a($class, DataObject::class, true)) {
            throw new LogicException(sprintf(
                '%s needs a "data_class" that is a DataObject subclass, got "%s"',
                static::class,
                $class
            ));
        }

        return $class;
    }

    public function setDataClass(string $class): static
    {
        $this->dataClass = $class;
        $this->records = null;

        return $this;
    }

    public function setParentRelation(string $relation): static
    {
        $this->parentRelation = $relation;

        return $this;
    }

    public function setScopeRelation(string $relation): static
    {
        $this->scopeRelation = $relation;
        $this->records = null;

        return $this;
    }

    public function setSortField(string $field): static
    {
        $this->sortField = $field;

        return $this;
    }

    public function setMaxDepth(int $depth): static
    {
        $this->maxDepth = $depth;

        return $this;
    }

    public function getMaxDepth(): int
    {
        return max(0, (int) ($this->maxDepth ?? $this->config()->get('max_depth')));
    }

    /**
     * The database column holding the parent ID, or null when the tree is flat.
     */
    public function getParentField(): ?string
    {
        $relation = $this->parentRelation ?? (string) $this->config()->get('parent_relation');

        return $relation === '' ? null : $relation . 'ID';
    }

    /**
     * The database column scoping records to their owner, or null for an unscoped tree.
     */
    public function getScopeField(): ?string
    {
        $relation = $this->scopeRelation ?? (string) $this->config()->get('scope_relation');

        return $relation === '' ? null : $relation . 'ID';
    }

    public function getSortField(): string
    {
        return $this->sortField ?? (string) $this->config()->get('sort_field');
    }

    public function setScopeID(?int $scopeID): static
    {
        $this->scopeID = $scopeID ?: null;
        $this->scopeRecord = null;
        $this->records = null;

        return $this;
    }

    public function getScopeID(): ?int
    {
        return $this->scopeID;
    }

    public function getScopeRecord(): ?DataObject
    {
        $scopeField = $this->getScopeField();

        if (!$scopeField || !$this->scopeID) {
            return null;
        }

        if (!$this->scopeRecord) {
            $relation = substr($scopeField, 0, -2);
            $ownerClass = DataObject::singleton($this->getDataClass())->hasOne()[$relation] ?? null;

            if (!$ownerClass) {
                throw new LogicException(sprintf(
                    '%s is scoped to "%s" but %s has no such has_one relation',
                    static::class,
                    $relation,
                    $this->getDataClass()
                ));
            }

            $this->scopeRecord = DataObject::get($ownerClass)->byID($this->scopeID);
        }

        return $this->scopeRecord;
    }

    public function canView(): bool
    {
        $scopeField = $this->getScopeField();

        // A scoped tree is only as visible as the record that owns it
        if ($scopeField) {
            $scope = $this->getScopeRecord();

            return $scope ? $scope->canView() : false;
        }

        return DataObject::singleton($this->getDataClass())->canView();
    }

    /**
     * Every record belonging to this tree, keyed by ID, in sibling order.
     *
     * @return array<int, DataObject>
     */
    protected function getRecords(): array
    {
        if ($this->records !== null) {
            return $this->records;
        }

        $list = $this->getBaseList();
        $records = [];

        foreach ($list as $record) {
            $records[(int) $record->ID] = $record;
        }

        $this->records = $records;

        return $this->records;
    }

    /**
     * The unfiltered, scoped list this tree draws from.
     */
    protected function getBaseList(): DataList
    {
        $list = DataObject::get($this->getDataClass());
        $scopeField = $this->getScopeField();

        if ($scopeField) {
            // An unscoped request against a scoped source must return nothing rather than
            // everything, otherwise a missing parameter leaks the whole table.
            $list = $list->filter($scopeField, $this->scopeID ?? 0);
        }

        return $list->sort([$this->getSortField() => 'ASC', 'ID' => 'ASC']);
    }

    protected function flushRecords(): void
    {
        $this->records = null;
    }

    public function getTree(): array
    {
        $byParent = [];

        foreach ($this->getRecords() as $record) {
            if (!$record->canView()) {
                continue;
            }

            $byParent[$this->getParentID($record)][] = $record;
        }

        return $this->buildBranch($byParent, 0);
    }

    /**
     * @param array<int, array<int, DataObject>> $byParent
     * @return array<int, array<string, mixed>>
     */
    private function buildBranch(array $byParent, int $parentID, int $depth = 1): array
    {
        $branch = [];

        foreach ($byParent[$parentID] ?? [] as $record) {
            $data = $this->getNodeData($record);
            $data['children'] = $this->getParentField()
                ? $this->buildBranch($byParent, (int) $record->ID, $depth + 1)
                : [];
            $branch[] = $data;
        }

        return $branch;
    }

    public function getNode(string $id): ?DataObject
    {
        if (!ctype_digit($id) || (int) $id <= 0) {
            return null;
        }

        return $this->getRecords()[(int) $id] ?? null;
    }

    public function getNodeID(DataObject $node): string
    {
        return (string) $node->ID;
    }

    /**
     * Every record in a single class tree may sit at the top level.
     */
    public function allowsRoot(DataObject $node): bool
    {
        return true;
    }

    protected function getParentID(DataObject $record): int
    {
        $parentField = $this->getParentField();

        return $parentField ? (int) $record->$parentField : 0;
    }

    public function getNodeDepth(DataObject $node): int
    {
        $depth = 1;
        $parentID = $this->getParentID($node);
        $seen = [(int) $node->ID => true];

        while ($parentID > 0 && $depth < self::MAX_ANCESTOR_WALK) {
            $parent = $this->getNode((string) $parentID);

            if (!$parent || isset($seen[$parentID])) {
                break;
            }

            $seen[$parentID] = true;
            $depth++;
            $parentID = $this->getParentID($parent);
        }

        return $depth;
    }

    public function getNodeHeight(DataObject $node): int
    {
        $children = $this->getChildRecords((int) $node->ID);

        if (!$children) {
            return 1;
        }

        $height = 1;

        foreach ($children as $child) {
            $height = max($height, 1 + $this->getNodeHeight($child));
        }

        return $height;
    }

    /**
     * Direct children of $parentID, in sibling order.
     *
     * @return array<int, DataObject>
     */
    protected function getChildRecords(int $parentID): array
    {
        $children = [];

        foreach ($this->getRecords() as $record) {
            if ($this->getParentID($record) === $parentID) {
                $children[] = $record;
            }
        }

        return $children;
    }

    /**
     * $node plus every record beneath it.
     *
     * @return array<int, DataObject>
     */
    public function getSubtree(DataObject $node): array
    {
        $subtree = [$node];

        foreach ($this->getChildRecords((int) $node->ID) as $child) {
            $subtree = array_merge($subtree, $this->getSubtree($child));
        }

        return $subtree;
    }

    public function canAddChildren(?DataObject $parent): bool
    {
        $member = Security::getCurrentUser();

        if (!DataObject::singleton($this->getDataClass())->canCreate($member)) {
            return false;
        }

        // Adding anywhere in a scoped tree is a change to the thing that owns it
        $scope = $this->getScopeRecord();

        if ($scope && !$scope->canEdit($member)) {
            return false;
        }

        if (!$parent) {
            return true;
        }

        if (!$this->getParentField()) {
            return false;
        }

        if (!$this->nodeAttribute($parent, 'allowsTreeChildren', true)) {
            return false;
        }

        $maxDepth = $this->getMaxDepth();

        if ($maxDepth > 0 && $this->getNodeDepth($parent) + 1 > $maxDepth) {
            return false;
        }

        return $parent->canEdit($member);
    }

    public function createNode(?DataObject $parent): DataObject
    {
        if (!$this->canAddChildren($parent)) {
            throw new LogicException('Cannot add a node in this position');
        }

        $class = $this->getDataClass();
        /** @var DataObject $node */
        $node = $class::create();

        $scopeField = $this->getScopeField();

        if ($scopeField) {
            $node->$scopeField = $this->scopeID;
        }

        $parentField = $this->getParentField();

        if ($parentField) {
            $node->$parentField = $parent ? (int) $parent->ID : 0;
        }

        $siblings = $this->getChildRecords($parent ? (int) $parent->ID : 0);
        $node->{$this->getSortField()} = count($siblings) + 1;

        $this->extendNewNode($node, $parent);
        $node->write();
        $this->flushRecords();

        return $node;
    }

    /**
     * Hook for subclasses to give a brand new record sensible defaults, such as a placeholder
     * title, before it is written.
     */
    protected function extendNewNode(DataObject $node, ?DataObject $parent): void
    {
        if (!$node->Title && $node->hasField('Title')) {
            $node->Title = $this->getLabels()['newTitle'];
        }
    }

    public function moveNode(DataObject $node, ?DataObject $parent, int $position): void
    {
        $member = Security::getCurrentUser();

        if (!$node->canEdit($member)) {
            throw new LogicException('Cannot edit this node');
        }

        $parentField = $this->getParentField();
        $currentParentID = $this->getParentID($node);
        $newParentID = $parent ? (int) $parent->ID : 0;

        if ($newParentID !== $currentParentID) {
            if (!$parentField) {
                throw new LogicException('This tree does not support nesting');
            }

            if (!$this->canAddChildren($parent)) {
                throw new LogicException('Cannot move a node into this position');
            }

            // A node cannot be dropped inside itself or anything below it
            foreach ($this->getSubtree($node) as $descendant) {
                if ((int) $descendant->ID === $newParentID) {
                    throw new LogicException('Cannot move a node inside itself');
                }
            }

            $maxDepth = $this->getMaxDepth();

            if ($maxDepth > 0) {
                $newDepth = $parent ? $this->getNodeDepth($parent) + 1 : 1;

                if ($newDepth + $this->getNodeHeight($node) - 1 > $maxDepth) {
                    throw new LogicException('Moving this node would exceed the maximum depth');
                }
            }

            if ($parentField) {
                $node->$parentField = $newParentID;
            }
        }

        $this->reorderSiblings($node, $newParentID, $position);
        $this->flushRecords();
    }

    /**
     * Renumber the children of $parentID so $node lands at $position, writing only the records
     * whose sort actually moved.
     */
    protected function reorderSiblings(DataObject $node, int $parentID, int $position): void
    {
        $member = Security::getCurrentUser();
        $sortField = $this->getSortField();

        $siblings = array_values(array_filter(
            $this->getChildRecords($parentID),
            fn (DataObject $sibling) => (int) $sibling->ID !== (int) $node->ID
        ));

        $position = max(0, min($position, count($siblings)));
        array_splice($siblings, $position, 0, [$node]);

        foreach ($siblings as $index => $sibling) {
            $sort = $index + 1;
            $changed = (int) $sibling->$sortField !== $sort || $sibling->isChanged();

            if (!$changed) {
                continue;
            }

            // Every record whose position shifts is being edited, so check each one
            if (!$sibling->canEdit($member)) {
                throw new LogicException('Cannot reorder a node you are not allowed to edit');
            }

            $sibling->$sortField = $sort;
            $sibling->write();
        }
    }

    public function deleteNode(DataObject $node): void
    {
        $member = Security::getCurrentUser();
        $subtree = $this->getSubtree($node);

        // Deleting a branch deletes everything under it, so the whole subtree has to be allowed
        foreach ($subtree as $record) {
            if (!$record->canDelete($member)) {
                throw new LogicException('Cannot delete this node');
            }
        }

        // Depth first, so children never outlive their parent
        foreach (array_reverse($subtree) as $record) {
            $record->delete();
        }

        $this->flushRecords();
    }

    public function getNodeData(DataObject $node): array
    {
        $member = Security::getCurrentUser();
        $allowsChildren = $this->getParentField() !== null;

        if ($allowsChildren) {
            $allowsChildren = (bool) $this->nodeAttribute($node, 'allowsTreeChildren', true);
        }

        $parentID = $this->getParentID($node);

        return [
            'id' => $this->getNodeID($node),
            'parentID' => $parentID ? (string) $parentID : null,
            'title' => $this->getNodeTitle($node),
            'subtitle' => $this->nodeAttribute($node, 'getTreeNodeSubtitle'),
            'icon' => $this->nodeAttribute($node, 'getTreeNodeIcon')
                ?: (string) $this->config()->get('default_icon'),
            'badges' => $this->normaliseBadges($this->nodeAttribute($node, 'getTreeNodeBadges', [])),
            'canEdit' => $node->canEdit($member),
            'canDelete' => $node->canDelete($member),
            'canAddChildren' => $this->canAddChildren($node),
            'allowsChildren' => $allowsChildren,
            'allowsRoot' => $this->allowsRoot($node),
        ];
    }

    /**
     * Read one piece of display data off a record.
     *
     * A record can supply these either by implementing {@see TreeNodeProvider} or by picking the
     * methods up from an Extension, which is how a module can describe records in a class it does
     * not own without taking a hard dependency on this one.
     */
    protected function nodeAttribute(DataObject $node, string $method, mixed $default = null): mixed
    {
        if ($node instanceof TreeNodeProvider || $node->hasMethod($method)) {
            return $node->$method();
        }

        return $default;
    }

    /**
     * Drop anything malformed rather than trusting badge data straight into the client payload.
     *
     * @return array<int, array{text: string, type: string}>
     */
    protected function normaliseBadges(mixed $badges): array
    {
        if (!is_array($badges)) {
            return [];
        }

        $allowed = ['default', 'primary', 'secondary', 'info', 'success', 'warning', 'danger'];
        $clean = [];

        foreach ($badges as $badge) {
            if (!is_array($badge) || !isset($badge['text'])) {
                continue;
            }

            $type = $badge['type'] ?? 'secondary';
            $clean[] = [
                'text' => (string) $badge['text'],
                'type' => in_array($type, $allowed, true) ? $type : 'secondary',
            ];
        }

        return $clean;
    }

    protected function getNodeTitle(DataObject $node): string
    {
        $title = (string) ($this->nodeAttribute($node, 'getTreeNodeTitle') ?? '');

        if ($title === '') {
            $title = (string) $node->getTitle();
        }

        return $title !== '' ? $title : $this->getLabels()['untitled'];
    }

    public function getNodeForm(DataObject $node, string $name, $controller): Form
    {
        /** @var DefaultFormFactory $factory */
        $factory = Injector::inst()->get(DefaultFormFactory::class);

        return $factory->getForm($controller, $name, ['Record' => $node]);
    }

    public function getProtectedFields(): array
    {
        return array_values(array_filter([
            $this->getSortField(),
            $this->getParentField(),
            $this->getScopeField(),
        ]));
    }

    public function getLabels(): array
    {
        $singular = DataObject::singleton($this->getDataClass())->i18n_singular_name();
        $plural = DataObject::singleton($this->getDataClass())->i18n_plural_name();

        return [
            'singular' => $singular,
            'plural' => $plural,
            'addRoot' => _t(
                __CLASS__ . '.ADD_ROOT',
                'Add {name}',
                ['name' => $singular]
            ),
            'addChild' => _t(
                __CLASS__ . '.ADD_CHILD',
                'Add child {name}',
                ['name' => $singular]
            ),
            'newTitle' => _t(
                __CLASS__ . '.NEW_TITLE',
                'New {name}',
                ['name' => $singular]
            ),
            'untitled' => _t(
                __CLASS__ . '.UNTITLED',
                'Untitled {name}',
                ['name' => $singular]
            ),
        ];
    }
}
