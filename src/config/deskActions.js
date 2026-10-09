/**
 * The action buttons on each department's desk — one row of them on every enquiry card
 * [pages/DepartmentDashboard.jsx].
 *
 * THE LIST TO EDIT. Add, rename or reorder a department's buttons here; nothing else changes.
 * Each button is:
 *
 *   label    what the button says
 *   to       (row) => the page it opens, or null to hide the button on that card
 *   primary  true for the one button the department presses most (drawn filled)
 *   raise    instead of `to`: 'quotation' raises the enquiry's quotation and opens it
 *
 * `row` is one enquiry on the desk: `row.enquiry` (number, stage, customer, model…), `row.task`
 * (the department's task for it) and `row.records` — the newest `sample`, `quotation` and
 * `order` on the enquiry, each `{ _id, number, status }` or null.
 *
 * Every card also carries the hand-over actions — Update, Move on, Send back, Change date — and
 * a link to the enquiry itself, so those are not listed here.
 */
const enquiry = (row) => `/enquiries/${row.enquiry._id}`;
const sample = (row) => (row.records.sample ? `/samples/${row.records.sample._id}` : null);
const quotation = (row) => (row.records.quotation ? `/quotations/${row.records.quotation._id}` : null);
const order = (row) => (row.records.order ? `/orders/${row.records.order._id}` : null);

export const DESK_ACTIONS = {
  management: [
    { label: 'Open enquiry', to: enquiry, primary: true },
  ],
  marketing: [
    { label: 'Open enquiry', to: enquiry, primary: true },
    { label: 'Quotation', to: quotation },
    { label: 'Sample', to: sample },
  ],
  order_confirmation: [
    { label: 'Open order', to: order, primary: true },
    /* No order yet: it is booked from the accepted quotation. */
    { label: 'Book from the quotation', to: (row) => (row.records.order ? null : quotation(row)), primary: true },
  ],
  quotation: [
    { label: 'Cost the quotation', to: quotation, primary: true },
    /* Reached Pricing without one: raise it here rather than send somebody looking. */
    { label: 'Raise the quotation', raise: 'quotation', when: (row) => !row.records.quotation, primary: true },
    { label: 'Sample', to: sample },
  ],
  sampling: [
    { label: 'Open sample', to: sample, primary: true },
  ],
  production: [
    { label: 'Open order', to: order, primary: true },
    { label: 'Production board', to: () => '/production' },
  ],
  assembling: [
    { label: 'Open order', to: order, primary: true },
  ],
  quality: [
    { label: 'Quality checks', to: () => '/quality', primary: true },
    { label: 'Order', to: order },
  ],
  despatch: [
    { label: 'Dispatches', to: () => '/dispatches', primary: true },
    { label: 'Order', to: order },
  ],
  accounts: [
    { label: 'Payments', to: () => '/payments', primary: true },
    { label: 'Order', to: order },
  ],
};

/** The buttons a department's card shows, with the ones that have nowhere to go left out. */
export const deskActionsFor = (department, row) =>
  (DESK_ACTIONS[department] || [{ label: 'Open enquiry', to: enquiry, primary: true }])
    .map((action) => ({ ...action, href: action.to ? action.to(row) : null }))
    .filter((action) => action.href || (action.raise && (!action.when || action.when(row))));
