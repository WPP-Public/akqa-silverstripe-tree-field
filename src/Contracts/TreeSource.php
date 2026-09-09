<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Contracts;

use SilverStripe\Forms\Form;
use SilverStripe\ORM\DataObject;

/**
 * Describes a hierarchical set of records that a {@see \Akqa\SilverStripe\TreeField\Form\TreeField}
 * can render and mutate.
 *
 * A source is the *only* authority on which records belong to a tree. The client never tells the
 * server which class to load or which records are in scope - it passes a source key plus record
 * IDs, and the source resolves them. Implementations MUST therefore scope every lookup, so that a
 * record ID from outside the tree can never be read, moved or deleted through the field.
 */
interface TreeSource
{
    /**
     * A short, URL safe, stable identifier for this source, e.g. "menu-items".
     *
     * The key appears in request URLs and is matched against the keys registered with
     * {@see \Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry}. It must match
     * /^[a-z0-9][a-z0-9\-]*$/.
     */
    public function getKey(): string;

    /**
     * The class name of the records managed by this source.
     */
    public function getDataClass(): string;

    /**
     * Limit the source to a single owner record, e.g. one MenuSet.
     *
     * Implementations that are not scoped may ignore the value, but must still reject requests
     * that supply a scope they do not recognise.
     */
    public function setScopeID(?int $scopeID): static;

    public function getScopeID(): ?int;

    /**
     * The record the tree hangs off, if this source is scoped. Returns null for a global tree.
     */
    public function getScopeRecord(): ?DataObject;

    /**
     * Whether the current member may see this tree at all.
     */
    public function canView(): bool;

    /**
     * The whole tree, as nested arrays produced by {@see self::getNodeData()}, with each node's
     * descendants under a "children" key. Only nodes the member can view are included.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTree(): array;

    /**
     * Resolve a single record by its node identifier, or null when it is not part of this tree.
     *
     * Identifiers are opaque strings so that a tree can hold more than one class: a source over a
     * single class can simply use the record ID, while a mixed tree can prefix them, e.g.
     * "set-3" and "item-12". They must match /^[A-Za-z0-9_-]{1,64}$/.
     *
     * This is the security boundary for every mutating endpoint.
     */
    public function getNode(string $id): ?DataObject;

    /**
     * The node identifier for a record, as used by {@see self::getNode()}.
     */
    public function getNodeID(DataObject $node): string;

    /**
     * Build (but do not necessarily write) a new record under $parent.
     */
    public function createNode(?DataObject $parent): DataObject;

    /**
     * Re-parent and re-order $node so that it sits at $position among the children of $parent.
     *
     * $parent of null means "top level". Implementations must renumber siblings so the resulting
     * order is stable.
     */
    public function moveNode(DataObject $node, ?DataObject $parent, int $position): void;

    /**
     * Remove $node and everything beneath it.
     */
    public function deleteNode(DataObject $node): void;

    /**
     * Maximum nesting depth, where 1 means "a flat list". Zero means unlimited.
     */
    public function getMaxDepth(): int;

    /**
     * Depth of $node in the tree, where a top level node is 1.
     */
    public function getNodeDepth(DataObject $node): int;

    /**
     * Height of the subtree rooted at $node, where a leaf is 1.
     */
    public function getNodeHeight(DataObject $node): int;

    /**
     * Whether a child may be added under $parent (null for top level), taking both permissions
     * and the depth limit into account.
     */
    public function canAddChildren(?DataObject $parent): bool;

    /**
     * Whether $node is allowed to sit at the top level of the tree.
     *
     * Mixed trees use this to keep record types at the level they belong to, e.g. a menu item
     * can never become a menu set.
     */
    public function allowsRoot(DataObject $node): bool;

    /**
     * The client payload for a single record: identity, display and permission flags.
     *
     * @return array<string, mixed>
     */
    public function getNodeData(DataObject $node): array;

    /**
     * The form used to edit $node in the detail panel. Implementations normally delegate to
     * getCMSFields() through DefaultFormFactory.
     */
    public function getNodeForm(DataObject $node, string $name, $controller): Form;

    /**
     * Field names the detail form must never write, because the tree owns them: the parent, sort
     * and scope columns. A submission containing any of them is refused outright.
     *
     * @return array<int, string>
     */
    public function getProtectedFields(): array;

    /**
     * Human readable labels for the UI, keyed by "singular", "plural", "addRoot" and "addChild".
     *
     * @return array<string, string>
     */
    public function getLabels(): array;
}
