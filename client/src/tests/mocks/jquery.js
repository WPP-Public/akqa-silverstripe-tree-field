// entwine is not exercised by these tests; the bundle only needs the import to resolve
const jQuery = () => ({ entwine: () => {} });
jQuery.entwine = () => {};

export default jQuery;
