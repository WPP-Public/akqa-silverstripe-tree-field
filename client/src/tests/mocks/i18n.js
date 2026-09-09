// Stands in for the CMS i18n global while testing
export default {
  _t: (key, fallback) => fallback || key,
  inject: (template, params) => Object.entries(params || {}).reduce(
    (str, [name, value]) => str.replace(new RegExp(`\\{${name}\\}`, 'g'), value),
    template
  ),
};
