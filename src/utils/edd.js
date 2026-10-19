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
/**
 * A task's EDD: its enquiry's, or — raised from the customer with no enquiry — the latest date
 * the task itself gave [server: Todo `modelDates`].
 */
export const eddOfTask = (task) => {
  const fromEnquiry = eddOf(task?.enquiry);
  if (fromEnquiry || task?.enquiry) return fromEnquiry;
  const latest = (task?.modelDates || []).map((row) => row.date).filter(Boolean).sort().at(-1);
  return latest ? { date: latest, department: task.department || null } : null;
};

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
/* With or without an enquiry: a Production task raised from the customer goes through the same cycle [server: journey.service `jobFilter`]. */
export const needsRouting = (task) => Boolean(task?.kind === 'ask_edd' && !task.completed && !task.routing?.decidedAt);
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

export const showsEdd = (task) => Boolean(task?.kind && SHOWS_EDD_KINDS.includes(task.kind) && (task.enquiry || EDD_TASK_KINDS.includes(task.kind)));
export const givesEdd = (task) => Boolean(task?.kind && EDD_TASK_KINDS.includes(task.kind));

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

/**
 * The models a Production, Printing or Assembly task gives dates for — its routed models, else
 * its brief's [server: handoff.service `modelsOfTask`]. Several: a date is asked for each.
 */
export function modelsOfTask(task) {
  const routed = (task?.routing?.models || []).map((row) => (typeof row === 'string' ? row : row?.model)).filter(Boolean);
  if (routed.length) return [...new Set(routed.map((model) => String(model).trim()))];
  const listed = String(task?.brief?.models || '').split(',').map((model) => model.trim()).filter(Boolean);
  if (listed.length) return [...new Set(listed)];
  return task?.brief?.model ? [String(task.brief.model).trim()] : [];
}

/** Several models on a Production, Printing or Assembly task: each moves on its own [server: Todo `modelStatuses`]. */
export const movesByModel = (task) => Boolean(task?.kind && EDD_TASK_KINDS.includes(task.kind) && !task.completed && modelsOfTask(task).length > 1);

/** Where each model is: its own status once it moved alone, else the task's [server: handoff.service `modelStatusesOf`]. */
export function modelStatusesOf(task) {
  const models = modelsOfTask(task);
  if (models.length < 2) return [];
  const kept = new Map((task?.modelStatuses || []).map((row) => [row.model, row]));
  return models.map((model) => ({ model, status: kept.get(model)?.status || task?.status || '' }));
}

/** The models a move starts with ticked: on Production's task, a hand-over only the models routed to that team. */
export function modelsForStep(task, step) {
  const models = modelsOfTask(task);
  const rows = (task?.routing?.models || []).filter((row) => row && typeof row === 'object' && row.model);
  if (!step?.handsTo || task?.kind !== 'ask_edd' || !rows.length) return models;
  return rows.filter((row) => (step.handsTo === 'printing' ? row.printing : row.assembly && !row.printing)).map((row) => row.model);
}

/** The date this task gave for each model [server: Todo `modelDates`], as `{ model: 'YYYY-MM-DD' }`. */
export const datesOfTask = (task) => Object.fromEntries((task?.modelDates || []).map((row) => [row.model, row.date]));

/** Each model's EDD on the enquiry — the latest its teams gave — or [] [server: Enquiry `eddByModel`]. */
export const eddByModelOf = (enquiry) => (enquiry && typeof enquiry === 'object' && Array.isArray(enquiry.eddByModel) ? enquiry.eddByModel : []);

/**
 * The date this task already gave: its hand-over date while it hands on to Printing / Assembly,
 * else the latest date it gave its models [server: Todo `modelDates`] — or '' when none.
 */
export function givenDateOf(task) {
  if (handsOnOf(task).length && task?.routing?.handOverDate) return String(task.routing.handOverDate).slice(0, 10);
  const dates = (task?.modelDates || []).map((row) => row.date).filter(Boolean).sort();
  return dates.at(-1) || '';
}

/**
 * The statuses a task may move to: "Handed to Printing / Assembly" only where Production (or
 * Printing) routed a model there [server: handoff.service `setTaskStatus`].
 */
export const statusesFor = (task, statuses = []) => statuses.filter((step) => !step.handsTo || handsOnOf(task).includes(step.handsTo));
