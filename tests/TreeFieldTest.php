<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Tests;

use Akqa\SilverStripe\TreeField\Form\TreeField;
use Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeItem;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeOwner;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeSource;
use SilverStripe\Dev\SapphireTest;

class TreeFieldTest extends SapphireTest
{
    protected $usesDatabase = true;

    protected static $extra_dataobjects = [
        TestTreeOwner::class,
        TestTreeItem::class,
    ];

    private TestTreeOwner $owner;

    private TestTreeItem $item;

    private TestTreeItem $foreign;

    protected function setUp(): void
    {
        parent::setUp();

        TreeSourceRegistry::singleton()->register('test-items', TestTreeSource::class);
        $this->logInWithPermission('ADMIN');

        $this->owner = TestTreeOwner::create(['Title' => 'Owner A']);
        $this->owner->write();

        $other = TestTreeOwner::create(['Title' => 'Owner B']);
        $other->write();

        $this->item = TestTreeItem::create(['Title' => 'Mine', 'OwnerID' => $this->owner->ID]);
        $this->item->write();

        $this->foreign = TestTreeItem::create(['Title' => 'Theirs', 'OwnerID' => $other->ID]);
        $this->foreign->write();
    }

    private function field(): TreeField
    {
        return TreeField::create('Items', 'Items', 'test-items', $this->owner->ID);
    }

    public function testARecordInTheTreeCanBeOpenedOnLoad(): void
    {
        $field = $this->field()
            ->setSelectedNodeID($this->item->ID)
            ->setSelectionParam('ItemID');

        $this->assertSame((string) $this->item->ID, $field->getSelectedNodeID());
        $this->assertSame((string) $this->item->ID, $field->getSchemaDataDefaults()['selectedId']);
        $this->assertSame('ItemID', $field->getSchemaDataDefaults()['selectionParam']);

        $attributes = $field->getAttributes();
        $this->assertSame((string) $this->item->ID, $attributes['data-selected-id']);
        $this->assertSame('ItemID', $attributes['data-selection-param']);
    }

    public function testARecordFromAnotherTreeIsIgnored(): void
    {
        $this->assertNull($this->field()->setSelectedNodeID($this->foreign->ID)->getSelectedNodeID());
        $this->assertNull($this->field()->setSelectedNodeID('nonsense')->getSelectedNodeID());
        $this->assertNull($this->field()->setSelectedNodeID(null)->getSelectedNodeID());
    }
}
