<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Tests;

use Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeItem;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeOwner;
use Akqa\SilverStripe\TreeField\Tests\Fixtures\TestTreeSource;
use SilverStripe\Dev\FunctionalTest;
use SilverStripe\Security\SecurityToken;

/**
 * Covers the request boundary: who may call the endpoints, what a request is allowed to name, and
 * what happens when it names something outside its own tree.
 */
class TreeFieldControllerTest extends FunctionalTest
{
    protected $usesDatabase = true;

    protected static $extra_dataobjects = [
        TestTreeOwner::class,
        TestTreeItem::class,
    ];

    private TestTreeOwner $owner;

    private TestTreeOwner $otherOwner;

    private TestTreeItem $first;

    private TestTreeItem $second;

    private TestTreeItem $foreign;

    protected function setUp(): void
    {
        parent::setUp();

        TreeSourceRegistry::singleton()->register('test-items', TestTreeSource::class);

        $this->owner = TestTreeOwner::create(['Title' => 'Owner A']);
        $this->owner->write();

        $this->otherOwner = TestTreeOwner::create(['Title' => 'Owner B']);
        $this->otherOwner->write();

        $this->first = $this->makeItem('First', $this->owner->ID, 1);
        $this->second = $this->makeItem('Second', $this->owner->ID, 2);
        $this->foreign = $this->makeItem('Foreign', $this->otherOwner->ID, 1);
    }

    private function makeItem(string $title, int $ownerID, int $sort): TestTreeItem
    {
        $item = TestTreeItem::create([
            'Title' => $title,
            'OwnerID' => $ownerID,
            'Sort' => $sort,
        ]);
        $item->write();

        return $item;
    }

    private function loginAsEditor(): void
    {
        $this->logInWithPermission([
            'CMS_ACCESS',
            'TREE_FIELD_TEST_VIEW',
            'TREE_FIELD_TEST_EDIT',
            'TREE_FIELD_TEST_DELETE',
        ]);
    }

    private function treeUrl(?int $ownerID = null): string
    {
        return 'admin/tree-field/tree/test-items/' . ($ownerID ?? $this->owner->ID);
    }

    private function postJson(string $url, array $body, array $headers = []): \SilverStripe\Control\HTTPResponse
    {
        return $this->post(
            $url,
            [],
            array_merge(['Content-Type' => 'application/json'], $headers),
            null,
            json_encode($body)
        );
    }

    public function testAnonymousIsSentToTheLoginForm(): void
    {
        $this->logOut();
        $this->autoFollowRedirection = false;

        $response = $this->get($this->treeUrl());

        $this->assertSame(302, $response->getStatusCode());
        $this->assertStringContainsString(
            'Security/login',
            (string) $response->getHeader('Location')
        );
    }

    public function testCmsUserWithoutModelPermissionIsRefused(): void
    {
        $this->logInWithPermission(['CMS_ACCESS']);

        $response = $this->get($this->treeUrl());

        $this->assertSame(403, $response->getStatusCode());
    }

    public function testEditorReadsOnlyItsOwnScope(): void
    {
        $this->loginAsEditor();

        $response = $this->get($this->treeUrl());
        $this->assertSame(200, $response->getStatusCode());

        $body = json_decode($response->getBody(), true);
        $titles = array_column($body['nodes'], 'title');

        $this->assertSame(['First', 'Second'], $titles);
        $this->assertNotContains('Foreign', $titles);
    }

    public function testUnknownSourceKeyIsNotFound(): void
    {
        $this->loginAsEditor();

        $response = $this->get('admin/tree-field/tree/not-registered/' . $this->owner->ID);

        $this->assertSame(404, $response->getStatusCode());
    }

    public function testMoveRequiresASecurityToken(): void
    {
        $this->loginAsEditor();
        SecurityToken::enable();

        try {
            $response = $this->postJson('admin/tree-field/move/test-items/' . $this->owner->ID, [
                'nodeID' => $this->second->ID,
                'parentID' => 0,
                'position' => 0,
            ]);

            $this->assertSame(400, $response->getStatusCode());
            $this->assertSame(2, (int) TestTreeItem::get()->byID($this->second->ID)->Sort);
        } finally {
            SecurityToken::disable();
        }
    }

    public function testMoveReordersWithinScope(): void
    {
        $this->loginAsEditor();

        $response = $this->postJson('admin/tree-field/move/test-items/' . $this->owner->ID, [
            'nodeID' => $this->second->ID,
            'parentID' => 0,
            'position' => 0,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(1, (int) TestTreeItem::get()->byID($this->second->ID)->Sort);
        $this->assertSame(2, (int) TestTreeItem::get()->byID($this->first->ID)->Sort);
    }

    public function testMoveCannotTouchAnotherOwnersRecord(): void
    {
        $this->loginAsEditor();

        $response = $this->postJson('admin/tree-field/move/test-items/' . $this->owner->ID, [
            'nodeID' => $this->foreign->ID,
            'parentID' => 0,
            'position' => 0,
        ]);

        $this->assertSame(404, $response->getStatusCode());
        $this->assertSame(1, (int) TestTreeItem::get()->byID($this->foreign->ID)->Sort);
    }

    public function testMoveCannotAdoptAnotherOwnersRecordAsParent(): void
    {
        $this->loginAsEditor();

        $response = $this->postJson('admin/tree-field/move/test-items/' . $this->owner->ID, [
            'nodeID' => $this->second->ID,
            'parentID' => $this->foreign->ID,
            'position' => 0,
        ]);

        $this->assertSame(404, $response->getStatusCode());
        $this->assertSame(
            0,
            (int) TestTreeItem::get()->byID($this->second->ID)->ParentItemID
        );
    }

    public function testAddCreatesARecordInScope(): void
    {
        $this->loginAsEditor();

        $response = $this->postJson('admin/tree-field/add/test-items/' . $this->owner->ID, [
            'parentID' => $this->first->ID,
            'position' => 0,
        ]);

        $this->assertSame(201, $response->getStatusCode());

        $body = json_decode($response->getBody(), true);
        $created = TestTreeItem::get()->byID($body['createdID']);

        $this->assertNotNull($created);
        $this->assertSame($this->owner->ID, (int) $created->OwnerID);
        $this->assertSame($this->first->ID, (int) $created->ParentItemID);
    }

    public function testAddIsRefusedWithoutCreatePermission(): void
    {
        $this->logInWithPermission(['CMS_ACCESS', 'TREE_FIELD_TEST_VIEW']);

        $response = $this->postJson('admin/tree-field/add/test-items/' . $this->owner->ID, [
            'parentID' => 0,
            'position' => 0,
        ]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertCount(2, TestTreeItem::get()->filter('OwnerID', $this->owner->ID));
    }

    public function testDeleteRemovesTheRecord(): void
    {
        $this->loginAsEditor();

        $response = $this->postJson(
            'admin/tree-field/delete/test-items/' . $this->owner->ID . '/' . $this->second->ID,
            []
        );

        $this->assertSame(200, $response->getStatusCode());
        $this->assertNull(TestTreeItem::get()->byID($this->second->ID));
    }

    public function testDeleteCannotReachAnotherOwnersRecord(): void
    {
        $this->loginAsEditor();

        $response = $this->postJson(
            'admin/tree-field/delete/test-items/' . $this->owner->ID . '/' . $this->foreign->ID,
            []
        );

        $this->assertSame(404, $response->getStatusCode());
        $this->assertNotNull(TestTreeItem::get()->byID($this->foreign->ID));
    }

    public function testDeleteIsRefusedWithoutDeletePermission(): void
    {
        $this->logInWithPermission(['CMS_ACCESS', 'TREE_FIELD_TEST_VIEW', 'TREE_FIELD_TEST_EDIT']);

        $response = $this->postJson(
            'admin/tree-field/delete/test-items/' . $this->owner->ID . '/' . $this->second->ID,
            []
        );

        $this->assertSame(403, $response->getStatusCode());
        $this->assertNotNull(TestTreeItem::get()->byID($this->second->ID));
    }

    public function testFormSubmissionCannotSetStructuralFields(): void
    {
        $this->loginAsEditor();

        $response = $this->post(
            'admin/tree-field/nodeForm/test-items/' . $this->owner->ID . '/' . $this->second->ID,
            [
                'Title' => 'Renamed',
                'Sort' => 99,
                'action_save' => 1,
            ]
        );

        $this->assertSame(400, $response->getStatusCode());

        $unchanged = TestTreeItem::get()->byID($this->second->ID);
        $this->assertSame('Second', $unchanged->Title);
        $this->assertSame(2, (int) $unchanged->Sort);
    }
}
