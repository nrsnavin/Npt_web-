import api from './client.js';

const unwrap = (response) => response.data.data;

/** Admin-only user administration. Gated server-side on the users module. */
export const users = {
  catalogue: () => api.get('/users/catalogue').then(unwrap),
  list: (params) => api.get('/users', { params }).then((response) => response.data),
  get: (id) => api.get(`/users/${id}`).then(unwrap),
  create: (payload) => api.post('/users', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/users/${id}`, payload).then(unwrap),
  setAccess: ({ id, moduleAccess }) =>
    api.put(`/users/${id}/access`, { moduleAccess }).then(unwrap),
  resetAccess: (id) => api.post(`/users/${id}/access/reset`).then(unwrap),
  remove: (id) => api.delete(`/users/${id}`).then(unwrap),
};

export const auth = {
  login: (payload) => api.post('/auth/login', payload).then(unwrap),
  register: (payload) => api.post('/auth/register', payload).then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  updateProfile: (payload) => api.patch('/auth/me', payload).then(unwrap),
  changePassword: (payload) => api.post('/auth/change-password', payload).then(unwrap),

  /** Sends a one-time code to an email address or phone number. */
  requestOtp: (identifier) => api.post('/auth/otp/request', { identifier }).then(unwrap),
  verifyOtp: (payload) => api.post('/auth/otp/verify', payload).then(unwrap),

  requestVerification: (target) => api.post('/auth/verify/request', { target }).then(unwrap),
  confirmVerification: (payload) => api.post('/auth/verify/confirm', payload).then(unwrap),
};
