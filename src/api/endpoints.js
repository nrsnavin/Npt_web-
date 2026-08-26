import api from './client.js';

const unwrap = (response) => response.data.data;

/** The bottom-right dock: personal tasks and notes, plus plant-wide announcements. */
export const workspace = {
  todos: {
    list: (params) => api.get('/workspace/todos', { params }).then(unwrap),
    reminders: () => api.get('/workspace/todos/reminders').then(unwrap),
    create: (payload) => api.post('/workspace/todos', payload).then(unwrap),
    update: ({ id, ...payload }) => api.patch(`/workspace/todos/${id}`, payload).then(unwrap),
    remove: (id) => api.delete(`/workspace/todos/${id}`).then(unwrap),
  },
  notes: {
    list: () => api.get('/workspace/notes').then(unwrap),
    create: (payload) => api.post('/workspace/notes', payload).then(unwrap),
    update: ({ id, ...payload }) => api.patch(`/workspace/notes/${id}`, payload).then(unwrap),
    remove: (id) => api.delete(`/workspace/notes/${id}`).then(unwrap),
  },
  announcements: {
    list: () => api.get('/workspace/announcements').then((response) => response.data),
    create: (payload) => api.post('/workspace/announcements', payload).then(unwrap),
    markRead: (id) => api.post(`/workspace/announcements/${id}/read`).then(unwrap),
    remove: (id) => api.delete(`/workspace/announcements/${id}`).then(unwrap),
  },
};

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

/**
 * Phase 1: the product master and the pipeline that runs from a lead to a customer to an
 * enquiry. List endpoints return `{ data, pagination }`, so those keep the whole envelope.
 */
const listed = (response) => response.data;

export const products = {
  list: (params) => api.get('/products', { params }).then(listed),
  get: (id) => api.get(`/products/${id}`).then(unwrap),
  create: (payload) => api.post('/products', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/products/${id}`, payload).then(unwrap),
};

export const customers = {
  list: (params) => api.get('/customers', { params }).then(listed),
  get: (id) => api.get(`/customers/${id}`).then(unwrap),
  create: (payload) => api.post('/customers', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/customers/${id}`, payload).then(unwrap),
  /** Warns before submitting, on the same GST-then-number rule the server enforces. */
  checkDuplicate: (params) => api.get('/customers/check-duplicate', { params }).then(unwrap),
};

export const leads = {
  list: (params) => api.get('/leads', { params }).then(listed),
  get: (id) => api.get(`/leads/${id}`).then(unwrap),
  create: (payload) => api.post('/leads', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/leads/${id}`, payload).then(unwrap),
  addActivity: ({ id, ...payload }) => api.post(`/leads/${id}/activities`, payload).then(unwrap),
  /** Creates the customer, its first contact and optionally the first enquiry in one go. */
  convert: ({ id, ...payload }) => api.post(`/leads/${id}/convert`, payload).then(unwrap),
};

export const enquiries = {
  list: (params) => api.get('/enquiries', { params }).then(listed),
  get: (id) => api.get(`/enquiries/${id}`).then(unwrap),
  create: (payload) => api.post('/enquiries', payload).then(unwrap),
  createGroup: (payload) => api.post('/enquiries/group', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/enquiries/${id}`, payload).then(unwrap),
  setStatus: ({ id, ...payload }) => api.post(`/enquiries/${id}/status`, payload).then(unwrap),
  promoteToProduct: ({ id, ...payload }) =>
    api.post(`/enquiries/${id}/promote-product`, payload).then(unwrap),
  pipeline: () => api.get('/enquiries/pipeline').then(unwrap),
};

/** Phase 2: sample requests, from the enquiry that raised one to the customer's answer. */
export const samples = {
  list: (params) => api.get('/samples', { params }).then(listed),
  get: (id) => api.get(`/samples/${id}`).then(unwrap),
  create: (payload) => api.post('/samples', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/samples/${id}`, payload).then(unwrap),
  assign: ({ id, ...payload }) => api.post(`/samples/${id}/assign`, payload).then(unwrap),
  setStatus: ({ id, ...payload }) => api.post(`/samples/${id}/status`, payload).then(unwrap),
  /** What the customer said. On marketing's grant, not the sample team's. */
  recordFeedback: ({ id, ...payload }) => api.post(`/samples/${id}/feedback`, payload).then(unwrap),
  resample: ({ id, ...payload }) => api.post(`/samples/${id}/resample`, payload).then(unwrap),
  pipeline: () => api.get('/samples/pipeline').then(unwrap),
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
