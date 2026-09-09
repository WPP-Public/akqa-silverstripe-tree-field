import Injector from 'lib/Injector';
import TreeField from '../components/TreeField/TreeField';
import '../bundles/bundle';

/**
 * The bundle has one job at boot: put the component in the injector under the name the PHP field
 * asks for, early enough that the field can find it.
 */
describe('bundle', () => {
  it('does not register until the document is ready', () => {
    expect(Injector.component.registerMany).not.toHaveBeenCalled();
  });

  it('registers TreeField on DOMContentLoaded', () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(Injector.component.registerMany).toHaveBeenCalledWith({ TreeField });
  });

  it('does not wait for Injector.ready, which runs after the injector has loaded', () => {
    expect(Injector.ready).not.toHaveBeenCalled();
  });
});
