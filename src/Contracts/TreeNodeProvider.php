<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Contracts;

/**
 * Optional interface for DataObjects shown in a TreeField.
 *
 * None of this is required - {@see \Akqa\SilverStripe\TreeField\Sources\DataObjectTreeSource}
 * falls back to getTitle(), a generic icon and no badges. Implement it when a record wants
 * control over how it reads in the tree.
 */
interface TreeNodeProvider
{
    /**
     * The main label for the row. Should never be empty; return a placeholder for new records.
     */
    public function getTreeNodeTitle(): string;

    /**
     * Muted secondary text shown after the title, e.g. the URL a menu item points at.
     */
    public function getTreeNodeSubtitle(): ?string;

    /**
     * A CMS font icon class, e.g. "font-icon-link". Null uses the source default.
     */
    public function getTreeNodeIcon(): ?string;

    /**
     * Small pills rendered against the row.
     *
     * Each badge is ['text' => string, 'type' => 'default'|'info'|'success'|'warning'|'danger'].
     *
     * @return array<int, array{text: string, type?: string}>
     */
    public function getTreeNodeBadges(): array;

    /**
     * Whether this record is allowed to contain children at all, regardless of depth limits.
     */
    public function allowsTreeChildren(): bool;
}
