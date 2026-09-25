import api from './client.js';

const unwrap = (response) => response.data.data;

/** The bottom-right dock: personal tasks and notes, plus plant-wide announcements. */
/** This device's notifications. The profile switch says what happened itself. */
export const pushApi = {
  key: () => api.get('/workspace/push/key').then(unwrap),
  subscribe: (payload) => api.post('/workspace/push/subscribe', payload, { feedback: false }).then(unwrap),
  unsubscribe: (payload) => api.post('/workspace/push/unsubscribe', payload, { feedback: false }).then(unwrap),
};

/** Everything waiting on me — the bell. Read quietly: nobody pressed anything. */
export const inbox = {
  get: () => api.get('/inbox').then(unwrap),
};

/** A person's saved views — named filter sets pinned in their sidebar. */
export const views = {
  list: (page) => api.get('/workspace/views', { params: page ? { page } : undefined }).then(unwrap),
  create: (payload) => api.post('/workspace/views', payload, { feedback: false }).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/workspace/views/${id}`, payload, { feedback: false }).then(unwrap),
  remove: (id) => api.delete(`/workspace/views/${id}`, { feedback: false }).then(unwrap),
};

export const workspace = {
  /**
   * Tasks [§35]. `scope` picks which question is being asked: `mine` (the default) is what I am
   * holding, `department` is my department's queue, `customers` is marketing's view across every
   * department's work on the buyers they own.
   *
   * `list` keeps the whole envelope rather than unwrapping to `data`, because the reply carries
   * which scope answered and whether this person has a customer view at all — the screen cannot
   * draw the tabs without it.
   */
  todos: {
    list: (params) => api.get('/workspace/todos', { params }).then((response) => response.data),
    reminders: () => api.get('/workspace/todos/reminders').then(unwrap),
    /**
     * What needs somebody in this department today: `{ handedOver, urgent }`.
     *
     * Two groups from one call, because they are drawn in one card and a second request would
     * let the halves of one block arrive at different times.
     */
    needsMe: () => api.get('/workspace/todos/needs-me').then((response) => response.data),
    /**
     * Whose job this looks like, and whether anything is waiting on it.
     *
     * A GET, because it proposes and moves nothing — the escalation below still needs its own
     * press. Being a GET is also what keeps it quiet: the toast layer only announces writes, so
     * a dropdown filling itself in does not raise "Record updated" at somebody.
     */
    suggest: (id) => api.get(`/workspace/todos/${id}/suggest`).then(unwrap),
    create: (payload) => api.post('/workspace/todos', payload).then(unwrap),
    update: ({ id, ...payload }) => api.patch(`/workspace/todos/${id}`, payload).then(unwrap),
    escalate: ({ id, ...payload }) =>
      api.post(`/workspace/todos/${id}/escalate`, payload).then(unwrap),
    remove: (id) => api.delete(`/workspace/todos/${id}`).then(unwrap),
  },
  /**
   * The review [§25]: what matters now, ranked.
   *
   * Keeps the whole envelope, because the reply carries which scope answered, whether a model
   * or the plant's own severity arithmetic ordered it, and when — all of which the panel says
   * out loud, since a ranking nobody can attribute is one nobody can argue with.
   */
  review: {
    read: (params) => api.get('/workspace/review', { params }).then((response) => response.data),
    /** Handing one finding to the department that can clear it. A task, raised by the presser. */
    raise: (payload) => api.post('/workspace/review/raise', payload).then(unwrap),
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
  /** `{ data, invitation }` — whether the welcome email went, and the link when it did not. */
  create: (payload) => api.post('/users', payload).then((response) => response.data),
  resendInvitation: (id) => api.post(`/users/${id}/invitation`).then((response) => response.data),
  update: ({ id, ...payload }) => api.patch(`/users/${id}`, payload).then(unwrap),
  setAccess: ({ id, moduleAccess }) =>
    api.put(`/users/${id}/access`, { moduleAccess }).then(unwrap),
  resetAccess: (id) => api.post(`/users/${id}/access/reset`).then(unwrap),
  workload: (id) => api.get(`/users/${id}/workload`).then(unwrap),
  remove: (id, transferTo) => api.delete(`/users/${id}`, { data: { transferTo } }).then(unwrap),
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
  /**
   * What has been costed on this resin, and how much of it on a rate that has since moved.
   *
   * Unwrapped to `{ rows, stale }` rather than handed over as a raw axios response — it had no
   * callers until the detail page, so nothing depended on the old shape and nothing should have
   * to know that `.data.data` is the list.
   */
  pricings: (id) =>
    api.get(`/materials/${id}/pricings`).then((response) => ({
      rows: response.data.data || [],
      stale: response.data.stale || 0,
    })),
  /**
   * The colours the register actually holds.
   *
   * Not a colour master — there is deliberately none. The colour of a moulded hanger is the
   * colour of the resin it is moulded in, so the list is derived from the material register and
   * offered as a suggestion rather than enforced as an enum. What it prevents is "White",
   * "white" and "Wht" becoming three colours nothing can be counted by.
   */
  colours: () => api.get('/materials/colours').then(unwrap),
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
  /** What has been costed with this part — see the note on the material register's own. */
  pricings: (id) =>
    api.get(`/components/${id}/pricings`).then((response) => ({
      rows: response.data.data || [],
      stale: response.data.stale || 0,
    })),
};

/**
 * Queries: a threaded question about a buyer, and everybody pulled in to answer it.
 *
 * Two calls here keep their whole envelope rather than unwrapping to `data`, and in both cases
 * it is because the extra half is the point:
 *
 *   `list` carries `read` — what a typed phrase was taken to mean, when the model read one. The
 *   screen shows those filters so the reader can see what narrowed their list and drop it. A
 *   list that has been quietly filtered by a guess is the failure this feature has to avoid.
 *
 *   `get` carries `gist` — the thread in a sentence, and `gist.writtenBy` saying whether a model
 *   or the thread's own words wrote it. Never stored anywhere, regenerated on every read, so
 *   there is no version of this the screen could fetch later.
 */
export const queries = {
  list: (params) => api.get('/queries', { params }).then((response) => response.data),
  get: (id) => api.get(`/queries/${id}`).then((response) => response.data),
  /*
   * The pickers, and what the model can do here.
   *
   * Keeps the envelope rather than unwrapping to the list, because `can` travels beside it: a
   * "draft a reply" button with no key behind it is a button that fails, and a spinner
   * resolving to nothing teaches people the feature is broken rather than absent.
   */
  options: () => api.get('/queries/options').then((response) => ({
    departments: response.data.data,
    can: response.data.can || {},
    admins: response.data.admins || [],
  })),
  create: (payload) => api.post('/queries', payload).then(unwrap),
  say: ({ id, ...payload }) => api.post(`/queries/${id}/messages`, payload).then(unwrap),
  /** A photo or document into the thread, with an optional caption and tags. */
  sendFile: ({ id, file, body, kind, mentions }) => {
    const form = new FormData();
    form.append('file', file);
    if (body) form.append('body', body);
    if (kind) form.append('kind', kind);
    if (mentions?.length) form.append('mentions', JSON.stringify(mentions));
    return api.post(`/queries/${id}/files`, form).then(unwrap);
  },
  /** Administrators: flag a thread urgent, or take the flag off. */
  urgent: ({ id, urgent, reason }) => api.post(`/queries/${id}/urgent`, { urgent, reason }).then(unwrap),
  /**
   * Pulling somebody else in. Keeps the envelope, because the reply says what the press actually
   * granted — adding a participant also lets them open the buyer, and a consequence nobody is
   * told about is one they meet later as a colleague who knows something they should not.
   */
  addParticipant: ({ id, ...payload }) =>
    api.post(`/queries/${id}/participants`, payload).then((response) => ({
      query: response.data.data,
      granted: response.data.granted,
    })),
  /**
   * How pressing the rows on screen are, read by the model.
   *
   * Asked for *after* the list has drawn, never as part of it: the rows already carry the
   * reading the rules gave them, and this refines it. A list that waited on a model call would
   * look broken for as long as the call took.
   */
  urgency: (ids) => api.post('/queries/urgency', { ids }).then(unwrap),
  /** A line per row, read after the list has drawn. Quiet: nobody pressed anything. */
  summaries: (ids) => api.post('/queries/summaries', { ids }, { feedback: false }).then(unwrap),
  /** One label added to, or taken off, several threads — the list's drag and drop. The page
      says what happened itself (with an undo), so the generic toast stays quiet. */
  bulkLabel: ({ ids, add, remove }) =>
    api.post('/queries/labels', { ids, add, remove }, { feedback: false }).then(unwrap),
  /** Labels that might fit a thread, from the ones in use. A suggestion — nothing is filed. */
  labelSuggestions: (id) => api.get(`/queries/${id}/label-suggestions`).then(unwrap),
  /** The thread's labels, replaced as a set. */
  setLabels: ({ id, labels }) => api.put(`/queries/${id}/labels`, { labels }).then(unwrap),
  /** A draft for the composer. Nothing is said in the thread until somebody presses send. */
  draftReply: (id) => api.post(`/queries/${id}/draft-reply`).then(unwrap),
  /**
   * Moves my own read cursor. A POST so that nothing but the screen actually opening the thread
   * — no prefetch, no link preview — can mark it read on somebody's behalf.
   *
   * `feedback: false` because it is a write nobody made: the toast layer announces every POST,
   * and "Query marked as read" on every thread opened is noise a chat app cannot make — nobody
   * pressed anything, so there is nothing to confirm.
   */
  read: (id) => api.post(`/queries/${id}/read`, {}, { feedback: false }).then(unwrap),
  close: (id) => api.post(`/queries/${id}/close`).then(unwrap),
  reopen: (id) => api.post(`/queries/${id}/reopen`).then(unwrap),
};

export const customers = {
  list: (params) => api.get('/customers', { params }).then(listed),
  /** Everything about the buyer, newest first; `before` pages back through it. */
  timeline: ({ id, before }) =>
    api.get(`/customers/${id}/timeline`, { params: before ? { before } : undefined }).then((response) => response.data),
  get: (id) => api.get(`/customers/${id}`).then(unwrap),
  /**
   * Everything hanging off one buyer, for the map view.
   *
   * Its own request rather than part of `get`, because it reaches eight collections and most
   * visits to a customer never switch to the map — paying for it on every open would slow the
   * screen everybody uses to serve the one they sometimes want.
   */
  map: (id) => api.get(`/customers/${id}/map`).then(unwrap),
  /**
   * The buyer's gate, pinned from a location somebody shared in a thread. Takes the thread and
   * the message rather than coordinates: the pin is only ever a recorded check-in, never typed.
   */
  pinSite: ({ id, query, message }) =>
    api.post(`/customers/${id}/site`, { query, message }).then(unwrap),
  clearSite: (id) => api.delete(`/customers/${id}/site`).then(unwrap),
  create: (payload) => api.post('/customers', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/customers/${id}`, payload).then(unwrap),
  /** Warns before submitting, on the same GST-then-number rule the server enforces. */
  checkDuplicate: (params) => api.get('/customers/check-duplicate', { params }).then(unwrap),
  /**
   * Who a new customer may be given to: the marketing team.
   *
   * Not `owners` — that is who currently holds records, for the filter, and it is scoped down to
   * one name for a marketing person. This is who *may* hold a new one, which is the whole team.
   * Keeps the envelope, because `meta.you` says whether the reader is on it.
   */
  team: () => api.get('/customers/team').then((response) => response.data),
};

export const leads = {
  list: (params) => api.get('/leads', { params }).then(listed),
  /** The same book as `list`, arranged as columns — every stage, the head of each. */
  board: (params) => api.get('/leads/board', { params }).then(boarded),
  get: (id) => api.get(`/leads/${id}`).then(unwrap),
  create: (payload) => api.post('/leads', payload).then(unwrap),
  update: ({ id, ...payload }) => api.patch(`/leads/${id}`, payload).then(unwrap),
  /** Who a new lead may be given to — the marketing team. See `customers.team`. */
  team: () => api.get('/leads/team').then((response) => response.data),
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
  /**
   * What marketing is asking the plant to pull forward, and why [§29].
   *
   * Its own door rather than part of `update`, because an order can only be edited before it is
   * released and this matters most after — when the job is on a press and the buyer has rung.
   */
  setPriority: ({ id, ...payload }) => api.post(`/orders/${id}/priority`, payload).then(unwrap),
  /**
   * A new delivery date the buyer has agreed to [§25].
   *
   * Per line, because two models on one PO are promised separately. The only thing that may move
   * a line's deadline — the plant's own `expectedCompletion` is a forecast and deliberately
   * cannot, which is the whole point of this door existing.
   */
  rePromise: ({ id, lineId, ...payload }) =>
    api.post(`/orders/${id}/lines/${lineId}/promise`, payload).then(unwrap),
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
/**
 * Quality [§15]: what was inspected, what was found, and what it cost.
 *
 * `onOrder` keeps the whole envelope rather than unwrapping to `data`, because the reply carries
 * two different things the order screen needs together — the history of what happened, and the
 * standing verdict per line, which is what is true *now*. A screen that fetched them separately
 * could show a verdict that disagrees with the inspection printed under it.
 */
export const quality = {
  /** The defect list, stages and verdicts — so a form cannot invent a defect the reports lack. */
  options: () => api.get('/quality/options').then(unwrap),
  list: (params) => api.get('/quality', { params }).then(listed),
  onOrder: (orderId) => api.get(`/orders/${orderId}/inspections`).then((response) => response.data),
  record: ({ orderId, ...payload }) =>
    api.post(`/orders/${orderId}/inspections`, payload).then((response) => response.data),
  /** Which tool, which defect, which resin, and what the scrap cost. */
  report: (params) => api.get('/quality/report', { params }).then((response) => response.data),
  /** Consignments sent despite the warning. The report that makes a soft gate honest. */
  overrides: (params) => api.get('/quality/overrides', { params }).then((response) => response.data),
};

/**
 * Payments [§20, §25] — a chase, not a ledger.
 *
 * Two departments work these and the split is deliberate. **Reading and following up** are on
 * the payments read grant, which the follow-up team and marketing both hold: the buyer knows
 * their marketing person and takes their call, so a chase only accounts could write is a chase
 * where marketing rings anyway and nobody records it.
 *
 * **A receipt needs write**, and that is not a status distinction — it is a claim about a bank
 * account, and the person who can check the bank account should be the one making it. Marketing
 * hearing "we paid Tuesday" logs a follow-up, which is what it is: something they were told.
 *
 * `get` keeps the envelope because the reply carries two things the screen needs together: this
 * one invoice, and the *order's* whole position with advances netted off. The number a buyer
 * quotes back on the phone is what they owe on the order, not on one document.
 */
export const payments = {
  list: (params) => api.get('/payments', { params }).then((response) => response.data),
  /**
   * The chase as a day's work, grouped by which conversation it is: a broken promise, an
   * overdue nobody has rung, the cheap call before it is late, and what is promised and still
   * ahead. One reply, so the screen cannot render half of itself.
   */
  day: () => api.get('/payments/day').then((response) => response.data),
  get: (id) => api.get(`/payments/${id}`).then((response) => response.data),
  /** What they said, and what they promised. Either department may log one. */
  followUp: ({ id, ...payload }) => api.post(`/payments/${id}/follow-ups`, payload).then(unwrap),
  /** Money in — accounts only. */
  receipt: ({ id, ...payload }) => api.post(`/payments/${id}/receipts`, payload).then(unwrap),
  /** Disputed or on hold, and clearing it again. Both stop the escalation ladder. */
  judgement: ({ id, ...payload }) => api.post(`/payments/${id}/judgement`, payload).then(unwrap),
  /** The advance a buyer owes before anything is made, against the order it belongs to. */
  raiseAdvance: ({ orderId, ...payload }) =>
    api.post(`/orders/${orderId}/advance`, payload).then(unwrap),
};

export const production = {
  list: (params) => api.get('/production', { params }).then((response) => response.data),
  /**
   * The plant's front page: what to run next, with the reason on each row, and the questions
   * marketing is waiting on. Both in one reply so the screen cannot render half of itself.
   */
  day: () => api.get('/production/day').then((response) => response.data),
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
 * Orders the floor has stopped on.
 *
 * The mirror of an order's `priority`, raised from the other end: marketing pulls an order
 * forward, and this is how production and despatch say one cannot move. Unlike a query it is
 * addressed to nobody, so `feed` is not narrowed by department — every day screen reads the
 * same list, scoped only by the orders the reader may already see.
 *
 * `feed` and `onOrder` keep their envelopes because the counts travel with the rows, and a
 * screen totalling them again would disagree with the one that did not.
 */
export const escalations = {
  feed: (params) => api.get('/escalations', { params }).then(listed),
  options: () => api.get('/escalations/options').then(unwrap),
  onOrder: (orderId) => api.get(`/orders/${orderId}/escalations`).then((response) => response.data),
  raise: ({ orderId, ...payload }) => api.post(`/orders/${orderId}/escalations`, payload).then(unwrap),
  update: ({ id, ...payload }) => api.post(`/escalations/${id}/updates`, payload).then(unwrap),
  resolve: ({ id, ...payload }) => api.post(`/escalations/${id}/resolve`, payload).then(unwrap),
};

/**
 * Dispatch [§18-19]: what is on a lorry, and what is still free to put on one.
 *
 * `ready` is despatch's own queue rather than a list of consignments — one row per order line
 * with what is packed, what other consignments are already holding and what is left. It keeps
 * its envelope because the "why is only 20,000 free when 30,000 are packed" answer travels
 * with the rows, and a screen that worked it out again would be a second implementation of the
 * reservation.
 *
 * `onOrder` is the tracker panel, and it is on the **orders** grant rather than this one: the
 * question "where are my customer's goods" belongs to whoever owns the order, and §19 is
 * written for exactly the people who cannot load a lorry themselves.
 */
export const dispatches = {
  list: (params) => api.get('/dispatches', { params }).then((response) => response.data),
  get: (id) => api.get(`/dispatches/${id}`).then((response) => response.data),
  create: (payload) => api.post('/dispatches', payload).then((response) => response.data),
  update: ({ id, ...payload }) => api.patch(`/dispatches/${id}`, payload).then((r) => r.data),
  actions: (id) => api.get(`/dispatches/${id}/actions`).then(unwrap),
  act: ({ id, ...payload }) => api.post(`/dispatches/${id}/actions`, payload).then((r) => r.data),
  board: (params) => api.get('/dispatches/board', { params }).then(boarded),
  /** What is free to send today, across every released order. */
  ready: (params) => api.get('/dispatches/ready', { params }).then((response) => response.data),
  /**
   * Despatch's front page: what to move today, what is packed with nothing claiming it, and the
   * questions marketing is waiting on. One reply, so the screen cannot render half of itself.
   */
  day: () => api.get('/dispatches/day').then((response) => response.data),
  /** The tracker panel: the consignments on one order, and the stock behind them. */
  onOrder: (orderId) => api.get(`/orders/${orderId}/dispatches`).then((response) => response.data),
  /**
   * What the customer was actually told, and why they need it then.
   *
   * Marketing's to set — it is a fact about a conversation the yard was not on. A null date
   * clears it and hands lateness back to the plant's own estimate.
   */
  promise: ({ id, ...payload }) => api.put(`/dispatches/${id}/promise`, payload).then(unwrap),
  /** Answering whoever flagged this consignment, on the to-do list they already read. */
  tellMarketing: ({ id, note }) =>
    api.post(`/dispatches/${id}/tell-marketing`, { note }).then(unwrap),
  /** The signed delivery note coming back. Multipart, so it goes as a form rather than JSON. */
  setPod: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.put(`/dispatches/${id}/pod`, form).then(unwrap);
  },
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
  /**
   * The bench's day: what has just come in, what is late, and what each open one needs next.
   *
   * A different question from `/samples/dashboard`, which answers how the team is doing over a
   * month. This answers what to pick up in the next hour, so it keeps its envelope — the counts
   * travel with the rows rather than being recounted on screen.
   */
  day: () => api.get('/samples/day').then((response) => response.data),
  get: (id) => api.get(`/samples/${id}`).then(unwrap),
  create: (payload) => api.post('/samples', payload).then(unwrap),
  /**
   * The whole envelope, for the one case where the sample is not all that happened.
   *
   * A request raised for a lead converts that lead — an enquiry needs a customer — and the
   * answer names the customer and the enquiry that came into being beside `data`. Unwrapping
   * to the sample alone would throw the only record of a consequence nobody asked for, and
   * the screen has to be able to say what it did.
   */
  createForLead: (payload) => api.post('/samples', payload).then((response) => response.data),
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
  dispatches: (params) => save('/dispatches/export', params, 'dispatches.csv'),
  moulds: (params) => save('/moulds/export', params, 'moulds.csv'),
  materials: (params) => save('/materials/export', params, 'materials.csv'),
  components: (params) => save('/components/export', params, `${params?.kind || 'parts'}s.csv`),
};


export const auth = {
  login: (payload) => api.post('/auth/login', payload).then(unwrap),
  /* Password links: the welcome invitation and a forgotten password. Quiet — each page says
     what happened in its own words, and a toast reading "Signed in" over a reset is wrong. */
  forgotPassword: (email) =>
    api.post('/auth/password/forgot', { email }, { feedback: false }).then((response) => response.data),
  checkResetLink: (token) => api.get(`/auth/password/reset/${encodeURIComponent(token)}`, { feedback: false }).then(unwrap),
  resetPassword: (payload) => api.post('/auth/password/reset', payload, { feedback: false }).then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  updateProfile: (payload) => api.patch('/auth/me', payload).then(unwrap),
  changePassword: (payload) => api.post('/auth/change-password', payload).then(unwrap),

  /** Sends a one-time code to an email address or phone number. */
  requestOtp: (identifier) => api.post('/auth/otp/request', { identifier }).then(unwrap),
  verifyOtp: (payload) => api.post('/auth/otp/verify', payload).then(unwrap),

  requestVerification: (target) => api.post('/auth/verify/request', { target }).then(unwrap),
  confirmVerification: (payload) => api.post('/auth/verify/confirm', payload).then(unwrap),
};
