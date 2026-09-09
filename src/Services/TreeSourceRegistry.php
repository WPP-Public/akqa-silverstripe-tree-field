<?php

declare(strict_types=1);

namespace Akqa\SilverStripe\TreeField\Services;

use Akqa\SilverStripe\TreeField\Contracts\TreeSource;
use InvalidArgumentException;
use SilverStripe\Core\Config\Configurable;
use SilverStripe\Core\Injector\Injectable;
use SilverStripe\Core\Injector\Injector;

/**
 * Maps the short source keys that appear in TreeField request URLs onto the services that can
 * serve them.
 *
 * Only keys registered here are reachable. This is deliberate: it means a request can never name
 * an arbitrary class for the field to load, move or delete records from.
 *
 * <code>
 * Akqa\SilverStripe\TreeField\Services\TreeSourceRegistry:
 *   sources:
 *     menu-items: Heyday\MenuManager\TreeField\MenuItemTreeSource
 * </code>
 */
class TreeSourceRegistry
{
    use Injectable;
    use Configurable;

    /**
     * Map of source key to Injector service name or class name.
     *
     * @var array<string, string>
     */
    private static array $sources = [];

    /**
     * Build a fresh source for $key, or null when nothing is registered under it.
     *
     * A new instance is returned every time because sources carry per-request state (their scope).
     */
    public function get(string $key): ?TreeSource
    {
        if (!$this->isValidKey($key)) {
            return null;
        }

        $service = $this->config()->get('sources')[$key] ?? null;

        if (!$service) {
            return null;
        }

        $source = Injector::inst()->create($service);

        if (!$source instanceof TreeSource) {
            throw new InvalidArgumentException(sprintf(
                'Source "%s" is registered as %s, which does not implement %s',
                $key,
                is_object($service) ? get_class($service) : (string) $service,
                TreeSource::class
            ));
        }

        return $source;
    }

    /**
     * Register a source at runtime. Config is the preferred route; this exists for tests and for
     * code that builds sources dynamically.
     */
    public function register(string $key, string $service): static
    {
        if (!$this->isValidKey($key)) {
            throw new InvalidArgumentException(sprintf('"%s" is not a valid tree source key', $key));
        }

        $sources = $this->config()->get('sources');
        $sources[$key] = $service;
        static::config()->set('sources', $sources);

        return $this;
    }

    /**
     * @return array<string, string>
     */
    public function getSources(): array
    {
        return $this->config()->get('sources') ?: [];
    }

    public function isValidKey(string $key): bool
    {
        return (bool) preg_match('/^[a-z0-9][a-z0-9\-]*$/', $key);
    }
}
