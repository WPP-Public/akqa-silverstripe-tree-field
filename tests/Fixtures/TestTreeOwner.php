<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Tests\Fixtures;

use SilverStripe\Dev\TestOnly;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\Permission;

class TestTreeOwner extends DataObject implements TestOnly
{
    private static string $table_name = 'TreeFieldTest_Owner';

    private static array $db = [
        'Title' => 'Varchar(255)',
    ];

    private static array $has_many = [
        'Items' => TestTreeItem::class . '.Owner',
    ];

    public function canView($member = null): bool
    {
        return Permission::checkMember($member, 'TREE_FIELD_TEST_VIEW');
    }

    public function canEdit($member = null): bool
    {
        return Permission::checkMember($member, 'TREE_FIELD_TEST_EDIT');
    }
}
