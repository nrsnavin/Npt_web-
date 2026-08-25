import api from './client.js';

const unwrap = (response) => response.data.data;

/** Builds the five standard calls for a REST resource. */
const resource = (path) => ({
  list: (params) => api.get(path, { params }).then((response) => response.data),
  get: (id) => api.get(`${path}/${id}`).then(unwrap),
  create: (payload) => api.post(path, payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`${path}/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`${path}/${id}`).then(unwrap),
});

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

export const customers = resource('/customers');
export const suppliers = resource('/suppliers');
export const products = resource('/products');
export const materials = resource('/materials');
export const boms = resource('/boms');
export const warehouses = resource('/warehouses');
export const users = resource('/users');
export const payments = resource('/payments');

export const leads = {
  ...resource('/leads'),
  pipeline: () => api.get('/leads/pipeline').then(unwrap),
  addActivity: ({ id, ...payload }) => api.post(`/leads/${id}/activities`, payload).then(unwrap),
  convert: ({ id, ...payload }) => api.post(`/leads/${id}/convert`, payload).then(unwrap),
};

export const quotations = {
  ...resource('/quotations'),
  convert: ({ id, ...payload }) => api.post(`/quotations/${id}/convert`, payload).then(unwrap),
};

export const salesOrders = {
  ...resource('/sales-orders'),
  planProduction: ({ id, ...payload }) =>
    api.post(`/sales-orders/${id}/plan-production`, payload).then(unwrap),
  dispatch: ({ id, ...payload }) => api.post(`/sales-orders/${id}/dispatch`, payload).then(unwrap),
  invoice: ({ id, ...payload }) => api.post(`/sales-orders/${id}/invoice`, payload).then(unwrap),
};

export const productionOrders = {
  ...resource('/production-orders'),
  workload: () => api.get('/production-orders/workload').then(unwrap),
  issueMaterials: ({ id, ...payload }) =>
    api.post(`/production-orders/${id}/issue-materials`, payload).then(unwrap),
  recordOutput: ({ id, ...payload }) => api.post(`/production-orders/${id}/output`, payload).then(unwrap),
};

export const purchaseOrders = {
  ...resource('/purchase-orders'),
  receive: ({ id, ...payload }) => api.post(`/purchase-orders/${id}/receive`, payload).then(unwrap),
};

export const stock = {
  levels: (params) => api.get('/stock', { params }).then(unwrap),
  movements: (params) => api.get('/stock/movements', { params }).then((response) => response.data),
  reorder: () => api.get('/stock/reorder').then(unwrap),
  adjust: (payload) => api.post('/stock/adjust', payload).then(unwrap),
};

export const invoices = {
  ...resource('/invoices'),
  ageing: () => api.get('/invoices/ageing').then(unwrap),
  recordPayment: ({ id, ...payload }) => api.post(`/invoices/${id}/payments`, payload).then(unwrap),
};

export const dashboard = {
  summary: () => api.get('/dashboard/summary').then(unwrap),
  salesTrend: (months = 6) => api.get('/dashboard/sales-trend', { params: { months } }).then(unwrap),
  topProducts: (limit = 5) => api.get('/dashboard/top-products', { params: { limit } }).then(unwrap),
};
