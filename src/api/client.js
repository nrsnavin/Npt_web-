import axios from 'axios';

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

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // An expired or revoked token should drop the user back to the login screen.
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

    const message =
      error.response?.data?.message || error.message || 'Something went wrong. Please try again.';
    const details = error.response?.data?.details;

    return Promise.reject(Object.assign(new Error(message), { details, status: error.response?.status }));
  }
);

export default api;
