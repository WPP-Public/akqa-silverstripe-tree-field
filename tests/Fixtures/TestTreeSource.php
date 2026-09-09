<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Tests\Fixtures;

use Akqa\SilverStripe\TreeField\Sources\DataObjectTreeSource;

class TestTreeSource extends DataObjectTreeSource
{
    private static string $key = 'test-items';

    private static string $data_class = TestTreeItem::class;

    private static string $parent_relation = 'ParentItem';

    private static string $scope_relation = 'Owner';

    private static int $max_depth = 3;
}
