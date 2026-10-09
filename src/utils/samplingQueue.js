/**
 * The sampling work queue's rules, kept apart from the screen [components/SamplingWorkQueue.jsx]
 * so they can be read and tested on their own. The server holds the same rules
 * [server: sampleDashboard.controller `QUEUE_STATUSES`, sample.controller `setSampleStatus`].
 */

/** The couriers offered in the handover form; "Other" lets the bench type one. */
export const SAMPLE_COURIERS = [
  'DTDC', 'Professional Couriers', 'ST Courier', 'Blue Dart', 'Delhivery', 'India Post',
  'Shree Maruti', 'Trackon', 'Franch Express',
];

/** The six statuses in queue order, and what choosing one does to the sample. */
export const QUEUE_ORDER = ['received', 'not_available', 'under_process', 'ready', 'sent', 'closed'];

export const UNSENT = ['received', 'not_available', 'under_process', 'ready'];

/** The sample status each queue status sets. `sent` and `closed` go through their own forms. */
export const SETS = {
  received: 'request_received',
  not_available: 'not_available',
  under_process: 'production_required',
  ready: 'sample_ready',
};

/** The filter chips above the table, each with the rows it keeps. */
export const CHIPS = [
  { key: 'all', label: 'All', test: (row) => !row.closed },
  { key: 'new', label: 'New Enquiry', test: (row) => !row.closed && row.queueStatus === 'received' },
  { key: 'highlighted', label: 'Highlighted', test: (row) => row.highlighted },
  { key: 'sampling', label: 'Sampling', test: (row) => !row.closed && ['received', 'not_available', 'under_process'].includes(row.queueStatus) },
  { key: 'dispatch', label: 'Dispatch', test: (row) => !row.closed && ['ready', 'sent'].includes(row.queueStatus) },
  { key: 'closed', label: 'Task Closed', test: (row) => row.closed },
];

/**
 * Whether choosing `to` on a row needs a reason first. Mirrors the server: not available,
 * a step back, and closing a task on a sample that never went out (it cancels the request).
 */
export function needsReason(row, to) {
  if (to === 'not_available') return true;
  if (to === 'closed') return UNSENT.includes(row.queueStatus);
  const from = QUEUE_ORDER.indexOf(row.queueStatus);
  return QUEUE_ORDER.indexOf(to) < from && to !== 'not_available';
}

/** The options a row's dropdown offers: once it has gone, the bench's steps are behind it. */
export const optionsFor = (row) =>
  row.closed
    ? ['closed']
    : row.queueStatus === 'sent'
      ? ['sent', 'closed']
      : QUEUE_ORDER;
