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
 * Phase 1: the pipeline that runs from a lead to a customer to an enquiry. List endpoints
 * return `{ data, pagination }`, so those keep the whole envelope.
 */
const listed = (response) => response.data;

/**
 * A board reply: the columns, plus the sort they were built with.
 *
 * The sort is not decoration. "Show more" on a column pages the ordinary list endpoint, and a
 * list ordered any differently would repeat some cards on page two while hiding others — with
 * page one still on screen to be compared against. Passing the board's own sort string back
 * through is what keeps the two halves of a column one list.
 */
const boarded = (response) => ({ columns: response.data.data.columns, sort: response.data.meta?.sort });

/**
 * The mould register, which is also the model master [§28]. Read by everyone with the grant,
 * written by the plant.
 *
 * The derived figures — consumption per piece, pieces an hour, shot weight — come back on
 * every row rather than being recomputed here. They are the register's answer, and a second
 * implementation in the browser is a second answer waiting to disagree with it.
 */
export const moulds = {
  list: (params) => api.get('/moulds', { params }).then(listed),
  get: (id) => api.get(`/moulds/${id}`).then(unwrap),
  create: (payload) => api.post('/moulds', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/moulds/${id}`, payload).then(unwrap),
  /** The part photo. Multipart, so it goes as a form rather than JSON. */
  setPhoto: (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    return api.put(`/moulds/${id}/photo`, form).then(unwrap);
  },
};

/**
 * The material register — what the plant buys, and the grammage basis a costing converts on.
 *
 * `pricings` answers the question a rate change raises: which sheets were built on the old
 * number. A costing deliberately keeps the rate it was built on, so nothing re-prices itself,
 * which means somebody has to decide what to re-cost.
 */
export const materials = {
  list: (params) => api.get('/materials', { params }).then(listed),
  get: (id) => api.get(`/materials/${id}`).then(unwrap),
  create: (payload) => api.post('/materials', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/materials/${id}`, payload).then(unwrap),
  pricings: (id) => api.get(`/materials/${id}/pricings`),
};

/**
 * The hook, clip and print registers — three registers over one collection.
 *
 * `kind` is required on every list, not optional: the server refuses a request without one
 * rather than returning all three, so a clip picker can never quietly fill with hooks.
 */
export const components = {
  list: (params) => api.get('/components', { params }).then(listed),
  get: (id) => api.get(`/components/${id}`).then(unwrap),
  create: (payload) => api.post('/components', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/components/${id}`, payload).then(unwrap),
  pricings: (id) => api.get(`/components/${id}/pricings`),
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
  /** The same book as `list`, arranged as columns — every stage, the head of each. */
  board: (params) => api.get('/leads/board', { params }).then(boarded),
  get: (id) => api.get(`/leads/${id}`).then(unwrap),
  create: (payload) => api.post('/leads', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/leads/${id}`, payload).then(unwrap),
  addActivity: ({ id, ...payload }) => api.post(`/leads/${id}/activities`, payload).then(unwrap),
  /** Creates the customer, its first contact and optionally the first enquiry in one go. */
  convert: ({ id, ...payload }) => api.post(`/leads/${id}/convert`, payload).then(unwrap),

  /** What the log adds up to — arithmetic over the entries, no model involved. */
  logAnalytics: (id) => api.get(`/leads/${id}/log-analytics`).then(unwrap),
  /**
   * Reads the log and proposes a next step. Proposes only: nothing reaches the lead until
   * somebody fills the form and saves, which is what keeps a misread cheap.
   */
  suggest: (id) => api.post(`/leads/${id}/suggest`).then(unwrap),
  /** Whose leads need somebody today — overdue, due, undecided, and quietly cooling. */
  followUps: () => api.get('/leads/follow-ups').then(unwrap),
  /** Outcomes and habits. Never activity — see the service for why that matters. */
  scoreboard: () => api.get('/leads/scoreboard').then(unwrap),
  /** The shape of the book, and the leads that are only nominally alive in it. */
  overview: () => api.get('/leads/overview').then(unwrap),
  /**
   * Who is holding leads, for the owner filter.
   *
   * Scoped like the list itself, so a marketing person is offered only themselves — which is
   * why the screen can decide whether to draw the picker from the answer alone.
   */
  owners: () => api.get('/leads/owners').then(unwrap),
};

export const enquiries = {
  /** Who is holding enquiries, for the owner filter. Scoped like the list itself. */
  owners: () => api.get('/enquiries/owners').then(unwrap),
  list: (params) => api.get('/enquiries', { params }).then(listed),
  get: (id) => api.get(`/enquiries/${id}`).then(unwrap),
  create: (payload) => api.post('/enquiries', payload).then(unwrap),
  createGroup: (payload) => api.post('/enquiries/group', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/enquiries/${id}`, payload).then(unwrap),
  setStatus: ({ id, ...payload }) => api.post(`/enquiries/${id}/status`, payload).then(unwrap),
  /**
   * What can be done to this enquiry from where it is, and doing one.
   *
   * The action carries the stage move, the follow-up it implies and the handover to whichever
   * department picks the work up — so the screen offers verbs rather than a list of stages.
   */
  actions: (id) => api.get(`/enquiries/${id}/actions`).then(unwrap),
  act: ({ id, ...payload }) => api.post(`/enquiries/${id}/actions`, payload).then(unwrap),
  promoteToMould: ({ id, ...payload }) =>
    api.post(`/enquiries/${id}/promote-mould`, payload).then(unwrap),
  pipeline: () => api.get('/enquiries/pipeline').then(unwrap),
  /** The funnel as columns you can work in, rather than a strip of counts you can only read. */
  board: (params) => api.get('/enquiries/board', { params }).then(boarded),
};

/**
 * Phase 4: sales orders [§12-13].
 *
 * An order comes back with its value redacted for anyone who may not see what the customer
 * agreed — production, quality and despatch get the model, the quantity and the date — and
 * carries `valueHidden` so the screen can say why the money is missing rather than looking
 * broken.
 *
 * `get` keeps the whole envelope rather than unwrapping to `data`, because the §13 checklist
 * travels beside the order: what the eight checks are, which are ticked and what each means is
 * the server's list, so adding a ninth needs no second edit here.
 */
export const orders = {
  list: (params) => api.get('/orders', { params }).then(listed),
  get: (id) => api.get(`/orders/${id}`).then((response) => response.data),
  create: (payload) => api.post('/orders', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/orders/${id}`, payload).then(unwrap),
  /** Ticking, or un-ticking, one of §13's eight. Keeps the envelope: it carries what is left. */
  setCheck: ({ id, ...payload }) => api.post(`/orders/${id}/checks`, payload).then((r) => r.data),
  /** What can be done from here, and doing one — verbs rather than a ladder of fourteen. */
  actions: (id) => api.get(`/orders/${id}/actions`).then(unwrap),
  act: ({ id, ...payload }) => api.post(`/orders/${id}/actions`, payload).then(unwrap),
  /** The customer's own paperwork. Multipart, so it goes as a form rather than JSON. */
  setPo: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.put(`/orders/${id}/po`, form).then(unwrap);
  },
  /** An accepted quotation becoming an order. Nothing is retyped — see the controller. */
  fromQuotation: ({ id, ...payload }) => api.post(`/quotations/${id}/order`, payload).then(unwrap),
  board: (params) => api.get('/orders/board', { params }).then(boarded),
};

/**
 * Production status [§14-17]: how far each order line has got.
 *
 * The unit is the line, so `list` returns one row per line across every released order rather
 * than a list of orders — the filters are about the line, and a screen that fetched orders and
 * filtered lines in the browser would page by order and show the wrong number of rows.
 *
 * `list` keeps the envelope: the counts of what is open, late and held travel with the rows,
 * and a screen that recounted them would be a second implementation of what "late" means.
 */
export const production = {
  list: (params) => api.get('/production', { params }).then((response) => response.data),
  statuses: () => api.get('/production/statuses').then(unwrap),
  /** What the plant did to one line. The figures and the status go through one door. */
  record: ({ orderId, lineId, ...payload }) =>
    api.patch(`/orders/${orderId}/lines/${lineId}/production`, payload).then((r) => r.data),
};

/**
 * Questions asked against an order, and the answers they are waiting for.
 *
 * All on the orders *read* grant, which is the point: marketing holds orders at read and is
 * who asks. Nothing here changes an order.
 *
 * `list` keeps the envelope — the counts of what is open and what is overdue travel with the
 * rows, and a panel that had to recount them would be a second implementation of the rule.
 */
export const orderQueries = {
  list: (orderId) => api.get(`/orders/${orderId}/queries`).then((response) => response.data),
  raise: ({ orderId, ...payload }) => api.post(`/orders/${orderId}/queries`, payload).then(unwrap),
  answer: ({ orderId, queryId, ...payload }) =>
    api.post(`/orders/${orderId}/queries/${queryId}/answers`, payload).then(unwrap),
  close: ({ orderId, queryId, ...payload }) =>
    api.post(`/orders/${orderId}/queries/${queryId}/close`, payload).then(unwrap),
  /** What my department is being asked, across every order. Defaults to the caller's own. */
  queue: (params) => api.get('/order-queries', { params }).then(listed),
};

/**
 * Phase 3: costings and the quotations priced off them [§7, §9, §10].
 *
 * A costing comes back redacted for anyone without `pricing: write` — the cost base, the
 * margin and the minimum are management's [§8] — and carries `costingHidden` so the screen can
 * say why it is thin rather than looking broken.
 */
export const pricings = {
  list: (params) => api.get('/pricings', { params }).then(listed),
  /**
   * One costing, with the model master behind it and what has been quoted off it.
   *
   * Keeps the whole envelope rather than unwrapping to `data`: the detail screen answers "is
   * this price right?", and that question needs the model's own standard and the offers
   * already made as much as it needs the sheet.
   */
  get: (id) => api.get(`/pricings/${id}`).then((response) => response.data),
  create: (payload) => api.post('/pricings', payload).then(unwrap),
  /**
   * What the costing is *of* — the quantity, the model, the target price.
   *
   * A different door from `cost` on purpose: correcting a quantity must not re-open an
   * approved price, and changing a price must not skip §9's floor.
   */
  update: ({ id, ...payload }) => api.patch(`/pricings/${id}`, payload).then(unwrap),
  /** Building the sheet. The calculated price is derived, never posted. */
  cost: ({ id, ...payload }) => api.patch(`/pricings/${id}/cost`, payload).then(unwrap),
  /** Signing off, or refusing, a price below the floor. */
  decide: ({ id, ...payload }) => api.post(`/pricings/${id}/decision`, payload).then(unwrap),
  /**
   * Turning an approved costing into a quotation [§7 → §10].
   *
   * The quantity may be left out, and usually is: the server starts it at the MOQ, which is the
   * smallest lot the approved price actually holds for.
   */
  quote: ({ id, ...payload }) => api.post(`/pricings/${id}/quotation`, payload).then(unwrap),
  /** What this sheet has already been quoted at. */
  quotations: (id) => api.get(`/pricings/${id}/quotations`).then(unwrap),
};

export const quotations = {
  list: (params) => api.get('/quotations', { params }).then(listed),
  get: (id) => api.get(`/quotations/${id}`).then(unwrap),
  create: (payload) => api.post('/quotations', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/quotations/${id}`, payload).then(unwrap),
  /** A new price, keeping the old one [§10]. */
  revise: ({ id, ...payload }) => api.post(`/quotations/${id}/revisions`, payload).then(unwrap),
  /** Putting it in front of the customer — where §9's gate applies. */
  send: ({ id, ...payload }) => api.post(`/quotations/${id}/send`, payload).then(unwrap),
  respond: ({ id, ...payload }) => api.post(`/quotations/${id}/response`, payload).then(unwrap),
  /**
   * The document itself, as a blob.
   *
   * Fetched rather than linked, because the route needs the session's bearer token and an
   * `<iframe src>` cannot carry one. The caller owns the object URL it makes from this and is
   * responsible for revoking it — an un-revoked blob URL holds the whole PDF in memory for the
   * life of the tab.
   */
  pdf: (id) => api.get(`/quotations/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
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
  /** The bench as columns. The four outcome columns are drawn but refuse a dropped card. */
  board: (params) => api.get('/samples/board', { params }).then(boarded),
  /**
   * Samples nobody is working on. Separate from `?overdue=true`, which asks whether a date
   * has passed — this asks whether anyone has touched it, and catches the sample quietly on
   * its way to being overdue while there is still time to do something about it.
   */
  anomalies: () => api.get('/samples/anomalies').then((response) => response.data),
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

/**
 * Ask Jarvis — one question, one answer, from the asker's own records.
 *
 * Stateless: no thread is sent, because each question stands on its own. An assistant whose
 * third answer depends on how it read the first is one nobody can retrace when it is wrong.
 */
export const jarvis = {
  ask: (message) => api.post('/jarvis/ask', { message }).then(unwrap),
};

/**
 * States and towns, suggested as somebody types one.
 *
 * The list exists for consistency rather than convenience: free text fills the database with
 * three spellings of Tiruppur, which is one town to the plant and three to every report that
 * groups by city.
 */
export const places = {
  states: (params) => api.get('/places/states', { params }).then(unwrap),
  cities: (params) => api.get('/places/cities', { params }).then(unwrap),
};

/** One search across everything [§32], grouped by record type. */
/**
 * Outside feeds [§41 by analogy]. Administrators only — reading this says nothing about the
 * pipeline and everything about the plumbing behind it.
 */
export const integrations = {
  indiamart: {
    status: () => api.get('/integrations/indiamart').then(unwrap),
    /** Spends one of a small number of API calls the whole plant shares — see the controller. */
    sync: () => api.post('/integrations/indiamart/sync').then(unwrap),
  },
};

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
  orders: (params) => save('/orders/export', params, 'sales-orders.csv'),
  production: (params) => save('/production/export', params, 'production.csv'),
  moulds: (params) => save('/moulds/export', params, 'moulds.csv'),
  materials: (params) => save('/materials/export', params, 'materials.csv'),
  components: (params) => save('/components/export', params, `${params?.kind || 'parts'}s.csv`),
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
