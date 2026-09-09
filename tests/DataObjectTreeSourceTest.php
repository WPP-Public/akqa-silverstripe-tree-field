<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Tests;

use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeItem;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeOwner;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeSource;
use LogicException;
use SilverStripe\Dev\SapphireTest;

class DataObjectTreeSourceTest extends SapphireTest
{
    protected $usesDatabase = true;

    protected static $extra_dataobjects = [
        TestTreeOwner::class,
        TestTreeItem::class,
    ];

    private TestTreeOwner $owner;

    private TestTreeOwner $otherOwner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->logInWithPermission([
            'TREE_FIELD_TEST_VIEW',
            'TREE_FIELD_TEST_EDIT',
            'TREE_FIELD_TEST_DELETE',
        ]);

        $this->owner = TestTreeOwner::create(['Title' => 'Owner A']);
        $this->owner->write();

        $this->otherOwner = TestTreeOwner::create(['Title' => 'Owner B']);
        $this->otherOwner->write();
    }

    private function makeSource(?TestTreeOwner $owner = null): TestTreeSource
    {
        return TestTreeSource::create()->setScopeID(($owner ?? $this->owner)->ID);
    }

    private function makeItem(string $title, int $ownerID, int $parentID = 0, int $sort = 1): TestTreeItem
    {
        $item = TestTreeItem::create([
            'Title' => $title,
            'OwnerID' => $ownerID,
            'ParentItemID' => $parentID,
            'Sort' => $sort,
        ]);
        $item->write();

        return $item;
    }

    public function testTreeIsNested(): void
    {
        $parent = $this->makeItem('Parent', $this->owner->ID, 0, 1);
        $this->makeItem('Child', $this->owner->ID, $parent->ID, 1);
        $this->makeItem('Sibling', $this->owner->ID, 0, 2);

        $tree = $this->makeSource()->getTree();

        $this->assertCount(2, $tree);
        $this->assertSame('Parent', $tree[0]['title']);
        $this->assertCount(1, $tree[0]['children']);
        $this->assertSame('Child', $tree[0]['children'][0]['title']);
        $this->assertSame('Sibling', $tree[1]['title']);
    }

    public function testNodeDataUsesRecordSuppliedDisplayValues(): void
    {
        $item = $this->makeItem('Parent', $this->owner->ID);
        $data = $this->makeSource()->getNodeData($item);

        $this->assertSame('item-' . $item->ID, $data['subtitle']);
        $this->assertTrue($data['canEdit']);
        $this->assertTrue($data['canDelete']);
    }

    public function testScopeHidesOtherOwnersRecords(): void
    {
        $mine = $this->makeItem('Mine', $this->owner->ID);
        $theirs = $this->makeItem('Theirs', $this->otherOwner->ID);

        $source = $this->makeSource();

        $this->assertNotNull($source->getNode((string) $mine->ID));
        $this->assertNull(
            $source->getNode((string) $theirs->ID),
            'A record belonging to another owner must not be reachable through this scope'
        );
    }

    public function testUnscopedSourceReturnsNothingRatherThanEverything(): void
    {
        $this->makeItem('Mine', $this->owner->ID);

        $source = TestTreeSource::create()->setScopeID(null);

        $this->assertSame([], $source->getTree());
    }

    public function testMoveReordersSiblings(): void
    {
        $first = $this->makeItem('First', $this->owner->ID, 0, 1);
        $second = $this->makeItem('Second', $this->owner->ID, 0, 2);
        $third = $this->makeItem('Third', $this->owner->ID, 0, 3);

        $source = $this->makeSource();
        $source->moveNode($third, null, 0);

        $titles = array_column($this->makeSource()->getTree(), 'title');

        $this->assertSame(['Third', 'First', 'Second'], $titles);
        $this->assertSame(1, (int) TestTreeItem::get()->byID($third->ID)->Sort);
        $this->assertSame(2, (int) TestTreeItem::get()->byID($first->ID)->Sort);
        $this->assertSame(3, (int) TestTreeItem::get()->byID($second->ID)->Sort);
    }

    public function testMoveIntoOwnDescendantIsRejected(): void
    {
        $parent = $this->makeItem('Parent', $this->owner->ID, 0, 1);
        $child = $this->makeItem('Child', $this->owner->ID, $parent->ID, 1);

        $source = $this->makeSource();

        $this->expectException(LogicException::class);
        $source->moveNode($parent, $source->getNode((string) $child->ID), 0);
    }

    public function testMoveBeyondMaxDepthIsRejected(): void
    {
        $level1 = $this->makeItem('One', $this->owner->ID, 0, 1);
        $level2 = $this->makeItem('Two', $this->owner->ID, $level1->ID, 1);
        $level3 = $this->makeItem('Three', $this->owner->ID, $level2->ID, 1);
        $loose = $this->makeItem('Loose', $this->owner->ID, 0, 2);
        $this->makeItem('LooseChild', $this->owner->ID, $loose->ID, 1);

        $source = $this->makeSource();

        // Loose is two levels tall, so it cannot start at level 3 when the limit is 3
        $this->expectException(LogicException::class);
        $source->moveNode($source->getNode((string) $loose->ID), $source->getNode((string) $level2->ID), 0);
    }

    public function testAddChildBeyondMaxDepthIsRefused(): void
    {
        $level1 = $this->makeItem('One', $this->owner->ID, 0, 1);
        $level2 = $this->makeItem('Two', $this->owner->ID, $level1->ID, 1);
        $level3 = $this->makeItem('Three', $this->owner->ID, $level2->ID, 1);

        $source = $this->makeSource();

        $this->assertTrue($source->canAddChildren($source->getNode((string) $level2->ID)));
        $this->assertFalse($source->canAddChildren($source->getNode((string) $level3->ID)));
    }

    public function testDeleteRemovesWholeSubtree(): void
    {
        $parent = $this->makeItem('Parent', $this->owner->ID, 0, 1);
        $child = $this->makeItem('Child', $this->owner->ID, $parent->ID, 1);
        $grandchild = $this->makeItem('Grandchild', $this->owner->ID, $child->ID, 1);
        $keep = $this->makeItem('Keep', $this->owner->ID, 0, 2);

        $source = $this->makeSource();
        $source->deleteNode($source->getNode((string) $parent->ID));

        $this->assertNull(TestTreeItem::get()->byID($parent->ID));
        $this->assertNull(TestTreeItem::get()->byID($child->ID));
        $this->assertNull(TestTreeItem::get()->byID($grandchild->ID));
        $this->assertNotNull(TestTreeItem::get()->byID($keep->ID));
    }

    public function testDeleteIsRefusedWhenADescendantCannotBeDeleted(): void
    {
        $parent = $this->makeItem('Parent', $this->owner->ID, 0, 1);
        $this->makeItem('Child', $this->owner->ID, $parent->ID, 1);

        // Can edit, but not delete
        $this->logInWithPermission(['TREE_FIELD_TEST_VIEW', 'TREE_FIELD_TEST_EDIT']);

        $source = $this->makeSource();

        $this->expectException(LogicException::class);
        $source->deleteNode($source->getNode((string) $parent->ID));
    }

    public function testCreateAppendsToTheEndOfItsSiblings(): void
    {
        $this->makeItem('First', $this->owner->ID, 0, 1);
        $this->makeItem('Second', $this->owner->ID, 0, 2);

        $source = $this->makeSource();
        $created = $source->createNode(null);

        $this->assertSame($this->owner->ID, (int) $created->OwnerID);
        $this->assertSame(3, (int) $created->Sort);
        $this->assertCount(3, $source->getTree());
    }

    public function testCreateIsRefusedWithoutCreatePermission(): void
    {
        // Read only member
        $this->logInWithPermission(['TREE_FIELD_TEST_VIEW']);

        $source = $this->makeSource();

        $this->assertFalse($source->canAddChildren(null));
        $this->expectException(LogicException::class);
        $source->createNode(null);
    }
}
