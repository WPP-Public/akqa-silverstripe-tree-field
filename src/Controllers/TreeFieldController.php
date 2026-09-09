<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Controllers;

use Akqa\SilverStripe\TreeField\Contracts\TreeSource;
use Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry;
use LogicException;
use SilverStripe\Admin\FormSchemaController;
use SilverStripe\Control\Controller;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Validation\ValidationException;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\FieldList;
use SilverStripe\Forms\Form;
use SilverStripe\Forms\FormAction;
use SilverStripe\ORM\DataObject;
use SilverStripe\Security\SecurityToken;

/**
 * Serves the data and the per-record edit form behind every {@see \Akqa\SilverStripe\TreeField\Form\TreeField}.
 *
 * Security model, in short:
 *
 *  - the request names a source *key*, never a class, and only keys registered with
 *    {@see TreeSourceRegistry} resolve to anything;
 *  - the source resolves every record ID itself, scoped to its own tree, so an ID belonging to
 *    another owner or another class comes back as "not found";
 *  - every read is gated on canView(), every write on canCreate()/canEdit()/canDelete() for the
 *    record *and* for anything else the write touches, such as re-sorted siblings;
 *  - every mutating request must carry a valid security token.
 */
class TreeFieldController extends FormSchemaController
{
    public const FORM_NAME_TEMPLATE = 'TreeNodeForm_%s_%s';

    private static string $url_segment = 'tree-field';

    /**
     * Any CMS user may reach the controller. What they can actually see and change is decided
     * per record by the source.
     */
    private static string $required_permission_codes = 'CMS_ACCESS';

    private static array $url_handlers = [
        'GET schema/$FormName/$SourceKey/$ScopeID/$NodeID' => 'schema',
        'GET tree/$SourceKey/$ScopeID' => 'treeData',
        'POST add/$SourceKey/$ScopeID' => 'addNode',
        'POST move/$SourceKey/$ScopeID' => 'moveNode',
        'POST delete/$SourceKey/$ScopeID/$NodeID' => 'deleteNode',
        'nodeForm/$SourceKey/$ScopeID/$NodeID' => 'nodeForm',
    ];

    private static array $allowed_actions = [
        'treeData',
        'addNode',
        'moveNode',
        'deleteNode',
        'nodeForm',
    ];

    /**
     * URL for one of the JSON endpoints, against one source and scope.
     */
    public function getActionLink(string $action, string $sourceKey, ?int $scopeID): string
    {
        return Controller::join_links(
            $this->Link($action),
            $sourceKey,
            (string) ($scopeID ?: 0)
        );
    }

    /**
     * The schema URL the client appends a record ID to.
     */
    public function getNodeFormSchemaLink(string $sourceKey, ?int $scopeID): string
    {
        return Controller::join_links(
            $this->Link('schema'),
            'nodeForm',
            $sourceKey,
            (string) ($scopeID ?: 0)
        );
    }

    /**
     * GET the whole tree.
     */
    public function treeData(): HTTPResponse
    {
        $source = $this->sourceFromRequest();

        return $this->jsonSuccess(200, $this->treePayload($source));
    }

    /**
     * POST a new record. Body: {"parentID": int, "position": int}
     */
    public function addNode(): HTTPResponse
    {
        $this->requireSecurityToken();

        $source = $this->sourceFromRequest();
        $body = $this->jsonBody();
        $parentID = $this->nodeIDFromBody($body, 'parentID');
        $position = $this->intFromBody($body, 'position');

        $parent = null;

        if ($parentID !== '') {
            $parent = $source->getNode($parentID);

            if (!$parent) {
                $this->jsonError(404, 'Parent not found');
            }
        }

        if (!$source->canAddChildren($parent)) {
            $this->jsonError(403);
        }

        try {
            $node = $source->createNode($parent);

            if ($position >= 0) {
                $source->moveNode($node, $parent, $position);
            }
        } catch (LogicException $e) {
            $this->jsonError(403, $e->getMessage());
        } catch (ValidationException $e) {
            $this->jsonError(400, $e->getMessage());
        }

        return $this->jsonSuccess(
            201,
            $this->treePayload($source) + ['createdID' => $source->getNodeID($node)]
        );
    }

    /**
     * POST a move. Body: {"nodeID": int, "parentID": int, "position": int}
     */
    public function moveNode(): HTTPResponse
    {
        $this->requireSecurityToken();

        $source = $this->sourceFromRequest();
        $body = $this->jsonBody();

        $node = $source->getNode($this->nodeIDFromBody($body, 'nodeID'));

        if (!$node) {
            $this->jsonError(404);
        }

        $parentID = $this->nodeIDFromBody($body, 'parentID');
        $parent = null;

        if ($parentID !== '') {
            $parent = $source->getNode($parentID);

            if (!$parent) {
                $this->jsonError(404, 'Parent not found');
            }
        }

        try {
            $source->moveNode($node, $parent, max(0, $this->intFromBody($body, 'position')));
        } catch (LogicException $e) {
            $this->jsonError(403, $e->getMessage());
        } catch (ValidationException $e) {
            $this->jsonError(400, $e->getMessage());
        }

        return $this->jsonSuccess(200, $this->treePayload($source));
    }

    /**
     * POST a delete of one record and everything under it.
     */
    public function deleteNode(): HTTPResponse
    {
        $this->requireSecurityToken();

        $source = $this->sourceFromRequest();
        $node = $source->getNode($this->nodeIDFromRequest());

        if (!$node) {
            $this->jsonError(404);
        }

        try {
            $source->deleteNode($node);
        } catch (LogicException $e) {
            $this->jsonError(403, $e->getMessage());
        }

        return $this->jsonSuccess(200, $this->treePayload($source));
    }

    /**
     * The edit form for one record, used both for GET schema requests and for POST saves.
     */
    public function nodeForm(): Form
    {
        $source = $this->sourceFromRequest();
        $node = $source->getNode($this->nodeIDFromRequest());

        if (!$node) {
            $this->jsonError(404);
        }

        if (!$node->canView()) {
            $this->jsonError(403);
        }

        return $this->createNodeForm($source, $node);
    }

    /**
     * Called by {@see FormSchemaController::schema()} for GET schema/nodeForm/... requests.
     */
    public function getNodeForm(): Form
    {
        return $this->nodeForm();
    }

    /**
     * Reached from FormRequestHandler::httpSubmission() when the detail panel is saved.
     */
    public function save(array $data, Form $form): HTTPResponse
    {
        $source = $this->sourceFromRequest();
        $id = $this->nodeIDFromRequest();
        $node = $source->getNode($id);

        if (!$node) {
            $this->jsonError(404);
        }

        if (!$node->canEdit()) {
            $this->jsonError(403);
        }

        // The record's position in the tree is owned by the tree, not by this form. Refusing the
        // submission outright means a crafted payload cannot quietly re-parent or re-sort a record
        // while bypassing the depth and cycle checks in moveNode().
        $protected = array_merge(['ID'], $source->getProtectedFields());

        foreach ($protected as $field) {
            if ($field === 'ID') {
                if (isset($data['ID']) && (int) $data['ID'] !== (int) $node->ID) {
                    $this->jsonError(400, 'Record ID mismatch');
                }
                continue;
            }

            if (array_key_exists($field, $data)) {
                $this->jsonError(400, sprintf('"%s" cannot be set from this form', $field));
            }
        }

        $form->saveInto($node);

        $validationResult = $node->validate();

        if (!$validationResult->isValid()) {
            throw ValidationException::create($validationResult);
        }

        if ($node->isChanged()) {
            $node->write();
        }

        $form = $this->createNodeForm($source, $node);

        return $this->getSchemaResponse(
            $form->FormAction(),
            $form,
            $validationResult,
            ['tree' => $this->treePayload($source)]
        );
    }

    /**
     * Build the detail panel form from the record's own getCMSFields().
     */
    protected function createNodeForm(TreeSource $source, DataObject $node): Form
    {
        $name = sprintf(
            TreeFieldController::FORM_NAME_TEMPLATE,
            str_replace('-', '_', $source->getKey()),
            preg_replace('/[^A-Za-z0-9_]/', '_', $source->getNodeID($node))
        );

        $form = $source->getNodeForm($node, $name, $this);

        $form->setFormAction(Controller::join_links(
            $this->Link('nodeForm'),
            $source->getKey(),
            (string) ($source->getScopeID() ?: 0),
            $source->getNodeID($node)
        ));

        $form->setActions(FieldList::create([
            FormAction::create('save', _t(__CLASS__ . '.SAVE', 'Save'))
                ->setSchemaData(['data' => ['buttonStyle' => 'primary']]),
        ]));

        $form->setValidationResponseCallback(
            function (ValidationResult $errors) use ($form, $source, $node) {
                $schemaID = Controller::join_links(
                    $this->getNodeFormSchemaLink($source->getKey(), $source->getScopeID()),
                    $source->getNodeID($node)
                );

                return $this->getSchemaResponse($schemaID, $form, $errors);
            }
        );

        if (!$node->canEdit()) {
            $form->makeReadonly();
        }

        $form->addExtraClass('tree-field__form form--no-dividers');

        return $form;
    }

    /**
     * @return array<string, mixed>
     */
    protected function treePayload(TreeSource $source): array
    {
        return [
            'nodes' => $source->getTree(),
            'maxDepth' => $source->getMaxDepth(),
            'canAdd' => $source->canAddChildren(null),
            'labels' => $source->getLabels(),
        ];
    }

    /**
     * Resolve the source named by the request, scoped and permission checked.
     */
    protected function sourceFromRequest(): TreeSource
    {
        $request = $this->getRequest();
        $key = (string) $request->param('SourceKey');
        $registry = TreeSourceRegistry::singleton();

        if (!$registry->isValidKey($key)) {
            $this->jsonError(404, 'Unknown tree source');
        }

        $source = $registry->get($key);

        if (!$source) {
            $this->jsonError(404, 'Unknown tree source');
        }

        $scopeID = (string) $request->param('ScopeID');

        if ($scopeID !== '' && !ctype_digit($scopeID)) {
            $this->jsonError(400, 'Invalid scope');
        }

        $source->setScopeID((int) $scopeID ?: null);

        if (!$source->canView()) {
            $this->jsonError(403);
        }

        return $source;
    }

    /**
     * The node identifier from the URL, checked against the allowed shape before it reaches a
     * source. Sources decide what an identifier means; this only decides what one may look like.
     */
    protected function nodeIDFromRequest(): string
    {
        $nodeID = (string) $this->getRequest()->param('NodeID');

        if (!$this->isValidNodeID($nodeID)) {
            $this->jsonError(404);
        }

        return $nodeID;
    }

    /**
     * @param array<string, mixed> $body
     */
    protected function nodeIDFromBody(array $body, string $key): string
    {
        $value = $body[$key] ?? '';

        if (is_int($value)) {
            $value = (string) $value;
        }

        if (!is_string($value)) {
            $this->jsonError(400, sprintf('"%s" must be a node identifier', $key));
        }

        // An empty value, or a zero left over from a numeric tree, both mean "top level"
        if ($value === '' || $value === '0') {
            return '';
        }

        if (!$this->isValidNodeID($value)) {
            $this->jsonError(400, sprintf('"%s" is not a valid node identifier', $key));
        }

        return $value;
    }

    protected function isValidNodeID(string $id): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id);
    }

    protected function requireSecurityToken(): void
    {
        if (!SecurityToken::inst()->checkRequest($this->getRequest())) {
            $this->jsonError(400, 'Invalid security token');
        }
    }

    /**
     * Decode and shallow validate a JSON request body.
     *
     * @return array<string, mixed>
     */
    protected function jsonBody(): array
    {
        $body = json_decode((string) $this->getRequest()->getBody(), true);

        if (!is_array($body)) {
            $this->jsonError(400, 'Expected a JSON object');
        }

        return $body;
    }

    /**
     * @param array<string, mixed> $body
     */
    protected function intFromBody(array $body, string $key, int $default = 0): int
    {
        $value = $body[$key] ?? $default;

        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && ctype_digit($value)) {
            return (int) $value;
        }

        $this->jsonError(400, sprintf('"%s" must be an integer', $key));

        // jsonError() always throws; this keeps static analysis happy about the return type
        return $default;
    }
}
