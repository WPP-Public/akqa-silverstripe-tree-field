<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Form;

use Akqa\SilverStripe\TreeField\Contracts\TreeSource;
use Akqa\SilverStripe\TreeField\Controllers\TreeFieldController;
use Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry;
use InvalidArgumentException;
use SilverStripe\Forms\FormField;
use SilverStripe\ORM\DataObject;
use SilverStripe\ORM\DataObjectInterface;
use SilverStripe\Security\SecurityToken;

/**
 * Manages a hierarchy of records inline: a drag and drop tree on one side, the selected record's
 * own getCMSFields on the other.
 *
 * The field itself holds no value. Everything it shows and changes comes from a
 * {@see TreeSource}, which the field names by key so that the client never has to be trusted
 * with a class name.
 *
 * <code>
 * TreeField::create('MenuItems', 'Menu items', 'menu-items', $menuSet->ID)
 * </code>
 */
class TreeField extends FormField
{
    protected $schemaComponent = 'TreeField';

    protected $schemaDataType = FormField::SCHEMA_DATA_TYPE_CUSTOM;

    protected $inputType = 'hidden';

    private string $sourceKey;

    private ?int $scopeID;

    private ?TreeSource $source = null;

    /**
     * Whether the detail panel is shown beside the tree. Turning it off leaves a tree that can
     * only be re-ordered.
     */
    private bool $showDetail = true;

    public function __construct(
        string $name,
        ?string $title = null,
        string $sourceKey = '',
        ?int $scopeID = null
    ) {
        $this->sourceKey = $sourceKey;
        $this->scopeID = $scopeID;

        parent::__construct($name, $title);
    }

    public function getSourceKey(): string
    {
        return $this->sourceKey;
    }

    public function setSourceKey(string $sourceKey): static
    {
        $this->sourceKey = $sourceKey;
        $this->source = null;

        return $this;
    }

    public function getScopeID(): ?int
    {
        return $this->scopeID;
    }

    public function setScopeID(?int $scopeID): static
    {
        $this->scopeID = $scopeID;
        $this->source = null;

        return $this;
    }

    public function setShowDetail(bool $showDetail): static
    {
        $this->showDetail = $showDetail;

        return $this;
    }

    public function getShowDetail(): bool
    {
        return $this->showDetail;
    }

    /**
     * The configured source, scoped to this field's record.
     */
    public function getSource(): TreeSource
    {
        if ($this->source) {
            return $this->source;
        }

        $source = TreeSourceRegistry::singleton()->get($this->sourceKey);

        if (!$source) {
            throw new InvalidArgumentException(sprintf(
                'No tree source is registered under the key "%s". Register one against %s.',
                $this->sourceKey,
                TreeSourceRegistry::class
            ));
        }

        $this->source = $source->setScopeID($this->scopeID);

        return $this->source;
    }

    /**
     * Point the field at a record, filling in the scope from it. Handy inside getCMSFields():
     * $field->setScopeRecord($this).
     */
    public function setScopeRecord(DataObject $record): static
    {
        return $this->setScopeID($record->isInDB() ? (int) $record->ID : null);
    }

    /**
     * URLs for the field's JSON endpoints and its detail form schema.
     *
     * @return array<string, string>
     */
    public function getUrls(): array
    {
        $controller = TreeFieldController::singleton();

        return [
            'tree' => $controller->getActionLink('tree', $this->sourceKey, $this->scopeID),
            'add' => $controller->getActionLink('add', $this->sourceKey, $this->scopeID),
            'move' => $controller->getActionLink('move', $this->sourceKey, $this->scopeID),
            'delete' => $controller->getActionLink('delete', $this->sourceKey, $this->scopeID),
            'schema' => $controller->getNodeFormSchemaLink($this->sourceKey, $this->scopeID),
            'form' => $controller->getActionLink('nodeForm', $this->sourceKey, $this->scopeID),
        ];
    }

    /**
     * Whether the member may add anything at the top level of this tree.
     */
    public function getCanAdd(): bool
    {
        return !$this->isReadonly()
            && !$this->isDisabled()
            && $this->getSource()->canAddChildren(null);
    }

    public function getSchemaDataDefaults(): array
    {
        // Note: this must not be called from getDefaultAttributes(). FormField's implementation
        // reads getAttributes(), so the two would call each other forever.
        $data = parent::getSchemaDataDefaults();
        $source = $this->getSource();

        $data['sourceKey'] = $this->sourceKey;
        $data['scopeID'] = $this->scopeID;
        $data['maxDepth'] = $source->getMaxDepth();
        $data['labels'] = $source->getLabels();
        $data['showDetail'] = $this->showDetail;
        $data['urls'] = $this->getUrls();
        $data['securityID'] = SecurityToken::inst()->getValue();

        return $data;
    }

    public function getSchemaStateDefaults(): array
    {
        $data = parent::getSchemaStateDefaults();

        $data['readonly'] = $this->isReadonly();
        $data['disabled'] = $this->isDisabled();
        $data['canAdd'] = $this->getCanAdd();

        return $data;
    }

    /**
     * Data attributes for the plain HTML rendering, which the entwine wrapper reads to mount the
     * same component React would have mounted.
     */
    protected function getDefaultAttributes(): array
    {
        $attributes = parent::getDefaultAttributes();
        $source = $this->getSource();

        $attributes['data-source-key'] = $this->sourceKey;
        $attributes['data-scope-id'] = $this->scopeID;
        $attributes['data-max-depth'] = $source->getMaxDepth();
        $attributes['data-show-detail'] = $this->showDetail ? 1 : 0;
        $attributes['data-urls'] = json_encode($this->getUrls());
        $attributes['data-labels'] = json_encode($source->getLabels());
        $attributes['data-readonly'] = $this->isReadonly() ? 1 : 0;
        $attributes['data-disabled'] = $this->isDisabled() ? 1 : 0;
        $attributes['data-security-id'] = SecurityToken::inst()->getValue();
        $attributes['data-can-add'] = $this->getCanAdd() ? 1 : 0;

        return $attributes;
    }

    /**
     * The tree writes its records as they change, so there is nothing to save with the parent form.
     */
    public function saveInto(DataObjectInterface $record): void
    {
        // Deliberately empty
    }

    public function performReadonlyTransformation(): FormField
    {
        $clone = clone $this;
        $clone->setReadonly(true);

        return $clone;
    }

    public function performDisabledTransformation(): FormField
    {
        $clone = clone $this;
        $clone->setDisabled(true);

        return $clone;
    }

    public function Type(): string
    {
        return 'treefield';
    }
}
