/**
 * Thin fetch wrapper for the TreeField JSON endpoints.
 *
 * Every mutating call carries the CMS security token in the X-SecurityID header, which is where
 * SecurityToken::checkRequest() looks first. The token is read from the field's schema data
 * rather than from a global, so a field rendered inside a form with its own token still works.
 */

const jsonHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

/**
 * Pull the most useful message out of a failed response body.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
const readError = async (response) => {
  try {
    const body = await response.json();

    if (body && body.value) {
      return body.value;
    }

    if (body && body.message) {
      return body.message;
    }
  } catch (e) {
    // Non JSON error body, fall through to the status text
  }

  return response.statusText || `Request failed (${response.status})`;
};

/**
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object|null>}
 */
const request = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  });

  if (!response.ok) {
    const error = new Error(await readError(response));
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

/**
 * Build an API client bound to one field's URLs and security token.
 *
 * @param {object} urls
 * @param {string} securityID
 */
const createApi = (urls, securityID) => {
  const mutate = (url, body) => request(url, {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      'X-SecurityID': securityID,
    },
    body: JSON.stringify(body || {}),
  });

  return {
    fetchTree: () => request(urls.tree, {
      method: 'GET',
      headers: jsonHeaders,
    }),

    addNode: (parentID, position) => mutate(urls.add, {
      parentID: parentID || '',
      position,
    }),

    moveNode: (nodeID, parentID, position) => mutate(urls.move, {
      nodeID,
      parentID: parentID || '',
      position,
    }),

    deleteNode: (nodeID) => mutate(`${urls.delete}/${nodeID}`),
  };
};

export default createApi;
export { request };
