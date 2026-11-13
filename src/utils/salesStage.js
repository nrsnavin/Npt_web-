import { stageLabel } from './pipeline.js';

/**
 * The sales stage as the screens show it [server: services/salesStage.service.js]. In the sales
 * stages (Enquiry, Sample, Pricing / Quote, PO & SO) the enquiry's sales status, which the server
 * keeps in step with the task stage. Past PO & SO the plant's stage — Production / EDD, Invoice &
 * Dispatch, LR Copy — so the two columns read the same. Lost and On hold say so wherever it is.
 * An enquiry Admin closed with its outcome reads that: Dispatched, Order completed, Enquiry cancelled.
 */
export const SALES_STAGE_KEYS = ['enquiry', 'sample', 'pricing_quote', 'po_so'];

/** `{ status, label }` — `status` picks the badge's colour, `label` is what it says. */
export function salesStageOf(enquiry, stages = []) {
  const status = enquiry?.status;
  /* Closed with its outcome recorded by Admin [server: enquiryClosure.service]: that is how it reads. */
  if (enquiry?.stage === 'closed' && enquiry.closure?.outcome) {
    return { status: status === 'lost' ? 'lost' : status === 'won' ? 'won' : status, label: enquiry.closure.label || stageLabel(status) };
  }
  const own = { status, label: stageLabel(status) };
  if (!enquiry?.stage || ['lost', 'hold'].includes(status) || enquiry.stage === 'closed' || SALES_STAGE_KEYS.includes(enquiry.stage)) return own;
  const plant = stages.find((stage) => stage.key === enquiry.stage)?.label;
  return plant ? { status: 'won', label: plant } : own;
}
