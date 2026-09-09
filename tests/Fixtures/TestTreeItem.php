<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Tests\Fixtures;

use SilverStripe\Dev\TestOnly;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\TabSet;
use SilverStripe\Forms\TextField;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\Permission;

class TestTreeItem extends DataObject implements TestOnly
{
    private static string $table_name = 'TreeFieldTest_Item';

    private static array $db = [
        'Title' => 'Varchar(255)',
        'Sort' => 'Int',
    ];

    private static array $has_one = [
        'Owner' => TestTreeOwner::class,
        'ParentItem' => TestTreeItem::class,
    ];

    private static array $has_many = [
        'Children' => TestTreeItem::class . '.ParentItem',
    ];

    private static string $default_sort = 'Sort ASC';

    public function canView($member = null): bool
    {
        return Permission::checkMember($member, 'TREE_FIELD_TEST_VIEW');
    }

    public function canEdit($member = null): bool
    {
        return Permission::checkMember($member, 'TREE_FIELD_TEST_EDIT');
    }

    public function canCreate($member = null, $context = []): bool
    {
        return Permission::checkMember($member, 'TREE_FIELD_TEST_EDIT');
    }

    public function canDelete($member = null): bool
    {
        return Permission::checkMember($member, 'TREE_FIELD_TEST_DELETE');
    }

    public function getCMSFields(): FieldList
    {
        return FieldList::create(
            TabSet::create('Root'),
            TextField::create('Title')
        );
    }

    public function getTreeNodeSubtitle(): ?string
    {
        return 'item-' . $this->ID;
    }
}
