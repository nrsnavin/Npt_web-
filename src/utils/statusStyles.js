/**
 * Status badge colours, tuned for the dark canvas: a translucent tint of the hue
 * plus a matching hairline, so badges read as part of the surface rather than
 * stickers on top of it. Unknown values fall back to neutral.
 */
const STATUS_TONES = {
  // Neutral — nothing is happening yet, or the document is finished and filed.
  draft: 'neutral',
  closed: 'neutral',
  inactive: 'neutral',

  // Informational — moving, but no action needed from us.
  sent: 'info',
  new: 'info',
  contacted: 'info',
  confirmed: 'info',
  qualified: 'info',
  quoted: 'info',
  quote_submitted: 'info',
  request_received: 'info',
  sample_available: 'info',
  delivered: 'info',

  // In flight — work is underway.
  planned: 'progress',
  released: 'progress',
  in_progress: 'progress',
  in_production: 'progress',
  ready_to_dispatch: 'progress',
  partially_dispatched: 'progress',
  partially_received: 'progress',
  partially_paid: 'progress',
  on_hold: 'progress',
  requirement_clarification: 'progress',
  sample_required: 'progress',
  pricing_required: 'progress',
  negotiation: 'progress',
  customer_decision_pending: 'progress',
  hold: 'progress',
  sample_feedback_pending: 'progress',
  checking_stock: 'progress',
  production_required: 'progress',
  printing_required: 'progress',
  customer_feedback_pending: 'progress',
  modification_required: 'progress',
  /* A tool in the tool room is work underway, the same as a job on a press is. */
  maintenance: 'progress',
  development: 'info',

  // Resolved well.
  accepted: 'success',
  converted: 'success',
  po_expected: 'success',
  sample_ready: 'success',
  won: 'success',
  active: 'success',
  paid: 'success',
  received: 'success',
  completed: 'success',
  dispatched: 'success',

  // Needs attention or ended badly.
  unpaid: 'danger',
  rejected: 'danger',
  disqualified: 'danger',
  lost: 'danger',
  cancelled: 'danger',
  expired: 'danger',
};

const TONE_CLASSES = {
  neutral: 'bg-line/[0.06] text-steel-300 ring-line/10',
  info: 'bg-aqua-500/15 text-aqua-300 ring-aqua-500/25',
  progress: 'bg-warn-500/15 text-warn-400 ring-warn-500/25',
  success: 'bg-success-500/15 text-success-400 ring-success-500/25',
  danger: 'bg-danger-500/15 text-danger-400 ring-danger-500/25',
  accent: 'bg-flame-500/15 text-flame-400 ring-flame-500/30',
};

export const statusTone = (status) => STATUS_TONES[status] || 'neutral';

export const statusClass = (status) => TONE_CLASSES[statusTone(status)];

export const toneClass = (tone) => TONE_CLASSES[tone] || TONE_CLASSES.neutral;
