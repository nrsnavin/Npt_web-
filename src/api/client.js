import axios from 'axios';
import { beginFeedback, finishFeedback } from './feedback.js';
import { failureFrom } from './failure.js';
import { shrinkForm } from '../utils/shrinkImage.js';

const TOKEN_KEY = 'npt.token';

/*
 * The session token: in storage while the app is open, and in memory alone while it is locked
 * behind the device PIN [context/AuthContext.jsx]. A locked browser then holds nothing at rest
 * a request could use, while the tab itself keeps working underneath the lock screen — an
 * upload finishing, the inbox polling — and a reload asks for the PIN.
 */
let memoryToken = null;
export const getToken = () => memoryToken || localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => { memoryToken = token; localStorage.setItem(TOKEN_KEY, token); };
export const clearToken = () => { memoryToken = null; localStorage.removeItem(TOKEN_KEY); };
/** Locking: out of storage, kept in memory for this tab. */
export const hideToken = () => { memoryToken = memoryToken || localStorage.getItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); };

/*
 * What a 401 does. The auth context registers a handler that drops only the refused account
 * and moves to the next one on the device [context/AuthContext.jsx]; without one (the login
 * page, a public page), the token goes and the login page is opened, as it always was.
 */
let unauthorizedHandler = null;
export const onUnauthorized = (handler) => {
  unauthorizedHandler = handler;
  return () => { if (unauthorizedHandler === handler) unauthorizedHandler = null; };
};
/* A request going out counts as activity for the idle lock [auth/idle.js]. */
const noteActivity = () => {
  try { localStorage.setItem('npt.lastActivity', String(Date.now())); } catch { /* storage blocked */ }
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (token && config.method && config.method.toLowerCase() !== 'get') noteActivity();

  /* Every upload passes here, so every photo is made smaller here — see shrinkImage.js. */
  if (config.data instanceof FormData) config.data = await shrinkForm(config.data);

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
      const handled = unauthorizedHandler ? unauthorizedHandler(error) : false;
      if (!handled) {
        clearToken();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
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

    /* The sentence and the error the screens read, worked out in `failure.js` — it is the part
       with a rule in it, and the only part of this interceptor a test can reach. */
    const failure = failureFrom(payload, error.response?.status, error.message);

    finishFeedback(error.config, error.response, { message: failure.message });
    return Promise.reject(failure);
  }
);

export default api;
