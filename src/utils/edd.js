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

/*
 * What follows moulding, decided by Production model by model [server: handoff.service
 * `decideRouting`]: a team that hands on gives the next team a hand-over date; the last team in
 * the chain — Production when nothing follows, else Printing or Assembly — gives the EDD.
 */
export const ROUTE_LABELS = { production: 'Production', printing: 'Printing', assembling: 'Assembly' };
/** The teams this task hands its goods to; empty for the last team. */
export const handsOnOf = (task) => (Array.isArray(task?.routing?.handsTo) ? task.routing.handsTo : []);
export const teamWords = (teams) => teams.map((team) => ROUTE_LABELS[team] || team).join(' and ');
/** Production has yet to say what follows moulding — it gives no date until it has. */
export const needsRouting = (task) => Boolean(task?.kind === 'ask_edd' && task.enquiry && !task.completed && !task.routing?.decidedAt);
/** The label of the date a task gives: a hand-over date while it hands on. */
export const dateLabelFor = (task, fallback) => {
  const teams = handsOnOf(task);
  return teams.length ? `Hand-over date to ${teamWords(teams)}` : fallback;
};
/** "Production → Printing → Assembly" — the path one model takes after moulding. */
export const pathOf = (row) => ['Production', row.printing && 'Printing', row.assembly && 'Assembly'].filter(Boolean).join(' → ');
/** "From Production 12 Nov · from Printing 15 Nov" — when the goods reach this team. */
export const incomingOf = (task) => Object.entries(task?.routing?.incoming || {})
  .filter(([, day]) => day)
  .map(([from, day]) => ({ from, label: ROUTE_LABELS[from] || from, day }));

export const showsEdd = (task) => Boolean(task?.kind && SHOWS_EDD_KINDS.includes(task.kind) && task.enquiry);
export const givesEdd = (task) => Boolean(task?.kind && EDD_TASK_KINDS.includes(task.kind) && task.enquiry);

/**
 * What a task says about the EDD, in one chip: the date; "EDD needed" on an open task whose
 * department is to give it; "EDD not given yet" on a dispatch request waiting for it. Null on a
 * task that does not work to one, and on a finished task with no date.
 */
export function eddChipOf(task) {
  if (!showsEdd(task)) return null;
  if (needsRouting(task)) return { tone: 'needed', label: 'Printing / assembly to decide' };
  const teams = handsOnOf(task);
  if (teams.length) {
    const day = task.routing?.handOverDate;
    if (day) return { tone: 'set', label: `To ${teamWords(teams)} ${formatDate(day)}` };
    return task.completed ? null : { tone: 'needed', label: 'Hand-over date needed' };
  }
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
