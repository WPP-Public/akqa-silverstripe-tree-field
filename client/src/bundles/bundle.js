import Injector from 'lib/Injector';
import TreeField from '../components/TreeField/TreeField';
import '../legacy/TreeField';

/**
 * Register the component under the name the PHP field declares as its schemaComponent.
 *
 * This has to happen on DOMContentLoaded, before silverstripe/admin calls Injector.load() on
 * window load. Registering inside Injector.ready() is too late: that queue is flushed after the
 * injector has loaded, by which point anything asking for the component gets
 * "Component TreeField does not exist".
 */
document.addEventListener('DOMContentLoaded', () => {
  Injector.component.registerMany({
    TreeField,
  });
});
