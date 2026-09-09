import Injector from 'lib/Injector';
import TreeField from '../components/TreeField/TreeField';
import '../legacy/TreeField';

// Registers the component under the name the PHP field declares as its schemaComponent
Injector.ready(() => {
  Injector.component.registerMany({
    TreeField,
  });
});
