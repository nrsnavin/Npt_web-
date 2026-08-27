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
  /** Courier, tracking number, date and quantity — recorded whenever they are known. */
  setDispatchDetails: ({ id, ...payload }) =>
    api.patch(`/samples/${id}/dispatch-details`, payload).then(unwrap),
  /** What the customer said. On marketing's grant, not the sample team's. */
  recordFeedback: ({ id, ...payload }) => api.post(`/samples/${id}/feedback`, payload).then(unwrap),
  resample: ({ id, ...payload }) => api.post(`/samples/${id}/resample`, payload).then(unwrap),
  /** Attaches a request raised before its enquiry existed. */
  linkEnquiry: ({ id, enquiry }) => api.post(`/samples/${id}/link-enquiry`, { enquiry }).then(unwrap),
  /** Names the buyer on a request raised for nobody — a counter job, or a trial gone real. */
  linkCustomer: ({ id, customer }) =>
    api.post(`/samples/${id}/link-customer`, { customer }).then(unwrap),
  pipeline: () => api.get('/samples/pipeline').then(unwrap),
  dashboard: () => api.get('/samples/dashboard').then(unwrap),
  analytics: (params) => api.get('/samples/analytics', { params }).then(unwrap),

  /** Outbound customer updates [§42]: the draft, the send, and everything already sent. */
  messagePreview: ({ id, event }) =>
    api.get(`/samples/${id}/customer-message/preview`, { params: { event } }).then(unwrap),
  sendMessage: ({ id, ...payload }) =>
    api.post(`/samples/${id}/customer-message`, payload).then(unwrap),
  messages: (id) => api.get(`/samples/${id}/customer-messages`).then(unwrap),

  /** The working record: notes, photos and comments on either. Paged — a feed, not a table. */
  logs: ({ id, ...params }) => api.get(`/samples/${id}/logs`, { params }).then(listed),
  addLog: ({ id, body, photo }) => {
    // Multipart only when there is a file; a plain note stays a JSON post.
    if (!photo) return api.post(`/samples/${id}/logs`, { body }).then(unwrap);

    const form = new FormData();
    if (body) form.append('body', body);
    form.append('photo', photo);
    return api.post(`/samples/${id}/logs`, form).then(unwrap);
  },
  removeLog: ({ id, logId }) => api.delete(`/samples/${id}/logs/${logId}`).then(unwrap),
  addComment: ({ id, logId, body }) =>
    api.post(`/samples/${id}/logs/${logId}/comments`, { body }).then(unwrap),
  removeComment: ({ id, logId, commentId }) =>
    api.delete(`/samples/${id}/logs/${logId}/comments/${commentId}`).then(unwrap),

  setReferencePhoto: ({ id, photo }) => {
    const form = new FormData();
    form.append('photo', photo);
    return api.put(`/samples/${id}/reference-photo`, form).then(unwrap);
  },
  clearReferencePhoto: (id) => api.delete(`/samples/${id}/reference-photo`).then(unwrap),
};

/** Per-department dashboards [§21-24]. */
export const dashboards = {
  marketing: () => api.get('/dashboard/marketing').then(unwrap),
};

/** One search across everything [§32], grouped by record type. */
export const search = (q) => api.get('/search', { params: { q } }).then(unwrap);

/** A stored file, fetched with the session's token rather than linked to directly. */
export const files = {
  blob: (key) => api.get(`/files/${key}`, { responseType: 'blob' }).then((response) => response.data),
};

/**
 * Documents on the records that carry them [§27] — a drawing, artwork, a signed approval.
 *
 * One shape for every collection, because the rule is the owning record's own access and only
 * the collection differs. `collection` is the URL segment: 'customers' or 'enquiries'.
 */
export const documents = {
  list: ({ collection, id }) => api.get(`/${collection}/${id}/documents`).then(unwrap),
  add: ({ collection, id, file, title }) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    return api.post(`/${collection}/${id}/documents`, form).then(unwrap);
  },
  remove: ({ collection, id, documentId }) =>
    api.delete(`/${collection}/${id}/documents/${documentId}`).then(unwrap),
};

/** Who changed what, and when. Gated on the record, so this 404s exactly where the record does. */
export const history = ({ model, id }) => api.get(`/history/${model}/${id}`).then(unwrap);

/** Moving a batch of records to another owner. Administration only, server-side. */
export const bulk = {
  reassign: ({ collection, ids, assignTo }) =>
    api.post(`/bulk/${collection}/reassign`, { ids, assignTo }).then(unwrap),
};

/**
 * Saves a file the browser cannot simply be pointed at.
 *
 * An export needs the session's token and an `<a href>` carries none, so it goes through the
 * same client as everything else and reaches the browser as a blob. The name comes from the
 * server's Content-Disposition rather than being invented here, so the date stamp on the file
 * is the one the server put on it.
 */
async function save(path, params, fallbackName) {
  const response = await api.get(path, { params, responseType: 'blob' });

  const disposition = response.headers['content-disposition'] || '';
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = named ? decodeURIComponent(named[1]) : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Released on a later tick: revoking it synchronously can beat the download starting.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * The list on screen, as a spreadsheet [§34].
 *
 * Each takes the same filters as its list endpoint, so the file is what the screen is showing
 * rather than a second query that drifts from it. Exporting "overdue follow-ups" and getting
 * every enquiry would be worse than having no export at all, because the file looks right.
 */
export const downloads = {
  customers: (params) => save('/customers/export', params, 'customers.csv'),
  leads: (params) => save('/leads/export', params, 'leads.csv'),
  enquiries: (params) => save('/enquiries/export', params, 'enquiries.csv'),
  products: (params) => save('/products/export', params, 'products.csv'),
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
