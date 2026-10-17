import { formatDate } from './format.js';

/**
 * The expected delivery date — one date on the enquiry [server: models/Enquiry.js `edd`], read
 * by every screen that works to it: the Production, Assembly and Printing tasks, which give it,
 * the dispatch request, which works to it, and marketing's list. Marketing sets it on the
 * enquiry; the shop floor gives or changes it from its task. The latest word wins.
 */

/** The tasks that give the enquiry its EDD: asked for it at the top of the task until it is given. */
export const EDD_TASK_KINDS = ['ask_edd', 'ask_assembling_edd', 'ask_printing'];
/** Those, and the dispatch request, which works to the date. */
export const SHOWS_EDD_KINDS = [...EDD_TASK_KINDS, 'invoice_dispatch'];

/** The enquiry's EDD as the server sends it — `{ date, department, at, by, note }` — or null. */
export const eddOf = (enquiry) => (enquiry && typeof enquiry === 'object' && enquiry.edd?.date ? enquiry.edd : null);

export const showsEdd = (task) => Boolean(task?.kind && SHOWS_EDD_KINDS.includes(task.kind) && task.enquiry);
export const givesEdd = (task) => Boolean(task?.kind && EDD_TASK_KINDS.includes(task.kind) && task.enquiry);

/**
 * What a task says about the EDD, in one chip: the date; "EDD needed" on an open task whose
 * department is to give it; "EDD not given yet" on a dispatch request waiting for it. Null on a
 * task that does not work to one, and on a finished task with no date.
 */
export function eddChipOf(task) {
  if (!showsEdd(task)) return null;
  const edd = eddOf(task.enquiry);
  if (edd) return { tone: 'set', label: `EDD ${formatDate(edd.date)}`, edd };
  if (task.completed) return null;
  return givesEdd(task) ? { tone: 'needed', label: 'EDD needed' } : { tone: 'missing', label: 'EDD not given yet' };
}

export const EDD_CHIP = {
  set: 'bg-accent/15 text-accent',
  needed: 'bg-warn-500/15 text-warn-400',
  missing: 'bg-line/[0.08] text-steel-400',
};
