/**
 * Append a path segment to one of the field's URLs.
 *
 * The URLs come from the server, which adds a trailing slash when the project has
 * Controller.add_trailing_slash turned on, so a plain template string would leave "//" behind.
 *
 * @param {string} base
 * @param {string|number} segment
 * @returns {string}
 */
const joinUrl = (base, segment) => `${String(base).replace(/\/+$/, '')}/${segment}`;

export default joinUrl;
