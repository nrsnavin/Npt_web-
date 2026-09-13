import axios from 'axios';
import { beginFeedback, finishFeedback } from './feedback.js';

const TOKEN_KEY = 'npt.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  /*
   * The instance sets application/json for every request, which is right for all of them
   * except an upload. A multipart body needs a boundary in its content type, and only the
   * browser knows what boundary FormData produced — so the header has to be dropped here and
   * left to it. Sending JSON's content type with a multipart body means the server never
   * parses the file at all, and the failure looks like an empty request rather than a wrong
   * header.
   */
  if (config.data instanceof FormData) delete config.headers['Content-Type'];

  beginFeedback(config);
  return config;
});

api.interceptors.response.use(
  (response) => { finishFeedback(response.config, response); return response; },
  async (error) => {
    // An expired or revoked token should drop the user back to the login screen.
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    /*
     * A failed download arrives as a Blob, because `responseType: 'blob'` was set for the
     * success case and axios applies it either way. Left alone, an export refused for want of
     * a grant would report axios's "Request failed with status code 403" instead of the
     * server's sentence saying which module is missing — the one useful thing in the reply,
     * sitting unread inside the body.
     */
    let payload = error.response?.data;
    if (payload instanceof Blob) {
      try {
        payload = JSON.parse(await payload.text());
      } catch {
        payload = undefined;
      }
    }

    const base = payload?.message || error.message || 'Something went wrong. Please try again.';

    /*
     * The field, said out loud.
     *
     * A refused save reported the server's headline and nothing else, and for a validation
     * failure that headline is the words "Validation failed" — true, and useless. The reply
     * already carries which field and why, so a person staring at a form with twenty boxes was
     * being told to find the wrong one themselves. Folded into the message here rather than into
     * each form, because every form makes the same mistake and none of them can fix it alone.
     */
    const named = (payload?.details || [])
      .filter((detail) => detail?.message)
      .slice(0, 3)
      .map((detail) => {
        /* `lines.0.quantity` is a path through the payload, not a name anybody typed. The last
           segment is the field; the digits in between are a row, which is worth saying. */
        const parts = String(detail.field || '').split('.');
        const field = parts.filter((part) => !/^\d+$/.test(part)).pop();
        const row = parts.find((part) => /^\d+$/.test(part));
        const label = (field || '')
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replace(/^./, (c) => c.toUpperCase());
        const where = row !== undefined ? `${label} on line ${Number(row) + 1}` : label;
        return where ? `${where}: ${detail.message}` : detail.message;
      });

    const message = named.length ? `${base} — ${named.join('; ')}` : base;

    finishFeedback(error.config, error.response, { message });
    return Promise.reject(
      Object.assign(new Error(message), { details: payload?.details, status: error.response?.status })
    );
  }
);

export default api;
