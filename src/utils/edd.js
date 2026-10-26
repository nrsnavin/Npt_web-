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
 * A task's EDD — marketing's: its enquiry's, or on a job raised from the customer, the job's
 * [server: Todo `jobEdd`]. Null until marketing or Admin sets it; a team's own dates are not it.
 */
export const eddOfTask = (task) => {
  const fromEnquiry = eddOf(task?.enquiry);
  if (fromEnquiry || task?.enquiry) return fromEnquiry;
  return task?.jobEdd?.date ? { ...task.jobEdd, department: 'marketing' } : null;
};

/** The tasks on the queues the EDD orders: the form asks marketing for it when raising one [server: eddAsk.service]. */
export const EDD_ASK_KINDS = ['ask_edd', 'ask_printing', 'ask_assembling_edd', 'invoice_dispatch'];

/*
 * What follows moulding, decided by Production model by model [server: handoff.service
 * `decideRouting`]: a team that hands on gives the next team a hand-over date; the last team in
 * the chain — Production when nothing follows, else Printing or Assembly — gives the completion
 * date. The EDD is marketing's.
 */
export const ROUTE_LABELS = { production: 'Production', printing: 'Printing', assembling: 'Assembly' };
/** The teams this task hands its goods to; empty for the last team. */
export const handsOnOf = (task) => (Array.isArray(task?.routing?.handsTo) ? task.routing.handsTo : []);
export const teamWords = (teams) => teams.map((team) => ROUTE_LABELS[team] || team).join(' and ');
/** Production has yet to say what follows moulding — it gives no date until it has. */
/* With or without an enquiry: a Production task raised from the customer goes through the same cycle [server: journey.service `jobFilter`]. */
export const needsRouting = (task) => Boolean(task?.kind === 'ask_edd' && !task.completed && !task.routing?.decidedAt);
/** The label of the date a task gives: a hand-over date while it hands on. */
/**
 * The date a move gives, in words: a hand-over date to the next team for a model that goes on from
 * here, else the team's own date (`fallback` — Printing's and Assembly's completion date). With
 * `models`, read by their route [routeEndOf]: a printed model with no assembly after ends on
 * Printing, so its date is the completion date, never a hand-over to Assembly. Without, or for
 * models not routed yet, by the task — it hands on if anything on it does.
 */
export const dateLabelFor = (task, fallback, models = []) => {
  const teams = handsOnOf(task);
  if (!teams.length) return fallback;
  const named = (Array.isArray(models) ? models : [models]).filter(Boolean);
  const ends = [...new Set(named.map((model) => routeEndOf(task, model)))];
  if (named.length && ends.length === 1 && ends[0] === 'dispatch') return fallback;
  if (named.length && ends.length === 1 && ends[0] && teams.includes(ends[0])) return `Hand-over date to ${teamWords([ends[0]])}`;
  return `Hand-over date to ${teamWords(teams)}`;
};
/** "Production → Printing → Assembly" — the path one model takes after moulding. */
export const pathOf = (row) => ['Production', row.printing && 'Printing', row.assembly && 'Assembly'].filter(Boolean).join(' → ');
/** "From Production 12 Nov · from Printing 15 Nov" — when the goods reach this team. */
export const incomingOf = (task) => Object.entries(task?.routing?.incoming || {})
  .filter(([, day]) => day)
  .map(([from, day]) => ({ from, label: ROUTE_LABELS[from] || from, day }));

/* With or without an enquiry: a job raised from the customer has its EDD too [server: Todo `jobEdd`]. */
export const showsEdd = (task) => Boolean(task?.kind && SHOWS_EDD_KINDS.includes(task.kind));
export const givesEdd = (task) => Boolean(task?.kind && EDD_TASK_KINDS.includes(task.kind));

/**
 * What a task says about its dates, in one chip: a team that still owes its own date says so
 * (hand-over date, or completion date); otherwise marketing's EDD, which everybody works to;
 * failing that, the team's own completion date. Null on a task that works to no date, and on a
 * finished task with none.
 */
export function eddChipOf(task) {
  if (!showsEdd(task)) return null;
  const edd = eddOfTask(task);
  /* No EDD first: the queues have no place for the work until marketing sets one [server: eddAsk.service]. */
  if (!edd && !task.completed) return { tone: 'needed', label: 'EDD needed from marketing' };
  if (needsRouting(task)) return { tone: 'needed', label: 'Printing / assembly to decide' };
  const teams = handsOnOf(task);
  if (teams.length) {
    const day = task.routing?.handOverDate;
    if (!day) return task.completed ? null : { tone: 'needed', label: 'Hand-over date needed' };
    return edd ? { tone: 'set', label: `EDD ${formatDate(edd.date)}`, edd } : { tone: 'set', label: `To ${teamWords(teams)} ${formatDate(day)}` };
  }
  const own = (task.modelDates || []).map((row) => row.date).filter(Boolean).sort().at(-1);
  if (givesEdd(task) && !own && !task.completed) return { tone: 'needed', label: 'Completion date needed' };
  if (edd) return { tone: 'set', label: `EDD ${formatDate(edd.date)}`, edd };
  if (own) return { tone: 'set', label: `Completes ${formatDate(own)}` };
  if (task.completed) return null;
  /* No EDD: the queues have no place for it until marketing sets one [server: eddAsk.service]. */
  return { tone: 'needed', label: 'EDD needed from marketing' };
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

/** Each model's dates on the enquiry — marketing's EDD for it, the teams' hand-over and completion dates — or [] [server: Enquiry `eddByModel`]. */
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
 * Printing) routed a model there [server: handoff.service `setTaskStatus`]. Where every model on
 * the task ends at the same place, the workflow ends there too [routeEndOf, trimToRoute].
 */
export const statusesFor = (task, statuses = []) => {
  /* Paid / Part Paid are Accounts' word [server: departmentTaskForms `byApp`] — shown as the status a task reads, never offered. */
  const offered = statuses.filter((step) => !step.byApp || step.key === task?.status);
  const handed = offered.filter((step) => !step.handsTo || handsOnOf(task).includes(step.handsTo));
  /* Nothing of the task's has come yet: only what may be said before the goods [goodsAwaited]. */
  const models = modelsOfTask(task);
  if (models.length && models.every((model) => goodsAwaited(task, model))) return handed.filter(beforeGoods(statuses));
  const ends = [...new Set((models.length ? models : [null]).map((model) => routeEndOf(task, model)))];
  return ends.length === 1 && ends[0] ? trimToRoute(task, handed, ends[0], task?.status) : handed;
};

/**
 * Where one model's workflow ends on this team, by its route — the move that closes it here
 * [server: handoff.service `closesModel`]:
 *   Production  Handed to Printing for a printed model, Handed to Assembly for one only assembled,
 *               Ready for Dispatch for one with neither;
 *   Printing    Handed to Assembly for a model assembled after (`routing.goesOn`), else Ready for Dispatch;
 *   Assembly    Ready for Dispatch.
 * `'printing'`, `'assembling'` or `'dispatch'` — null while the route is not known.
 */
export function routeEndOf(task, model) {
  if (task?.kind === 'ask_edd') {
    const route = model ? routeOf(task, model) : null;
    if (!route) return null;
    if (route.printing) return 'printing';
    return route.assembly ? 'assembling' : 'dispatch';
  }
  if (task?.kind === 'ask_printing') {
    const goesOn = task.routing?.goesOn;
    if (Array.isArray(goesOn)) return model && goesOn.includes(model) ? 'assembling' : 'dispatch';
    /* Routed before Printing knew which models go on: only "nothing goes on" is certain. */
    return task.routing?.byProduction && !handsOnOf(task).includes('assembling') ? 'dispatch' : null;
  }
  return task?.kind === 'ask_assembling_edd' ? 'dispatch' : null;
}

/**
 * A workflow cut to where it ends: the one hand-over (or Ready for Dispatch) that closes the
 * model here, nothing after it — no Task Closed, which that move does by itself, and on
 * Production no Assembling for a model that goes to the Assembly team or is not assembled at
 * all. `keep`: the status it stands at, always listed so the list reads it.
 */
export function trimToRoute(task, statuses = [], end, keep) {
  const ends = (step) => (end === 'dispatch' ? Boolean(step.readyForDispatch) : step.handsTo === end);
  return statuses.filter((step) => {
    if (keep && step.key === keep) return true;
    if (step.handsTo || step.readyForDispatch) return ends(step);
    /* Waiting for the payment to dispatch: only for a model that goes to Dispatch from here. */
    if (step.awaitsPayment) return end === 'dispatch';
    if (step.done) return false;
    return !(task?.kind === 'ask_edd' && step.key === 'assembling');
  });
}

/**
 * Printing's and Assembly's goods come from the team before [server: handoff.service `handOn`,
 * `movesFor`]: on a task Production routed, a model whose goods have not come yet moves no further
 * than Goods Received — the issues and closing the task excepted.
 */
const GOODS_KINDS = ['ask_printing', 'ask_assembling_edd'];
export const goodsAwaited = (task, model) => GOODS_KINDS.includes(task?.kind) && Boolean(task?.routing?.byProduction)
  && !task?.routing?.receivedModels?.[model];
/** The statuses that may be said before the goods have come: the first, Goods Received, an issue, closing it. */
const beforeGoods = (statuses) => (step) => step.key === statuses[0]?.key || step.receives || step.issue || step.done;
/** Where a model's goods stand on Printing's or Assembly's task: still to come, received, or in the work queue. */
export function goodsOf(task, model, statuses = [], status = task?.status) {
  if (!GOODS_KINDS.includes(task?.kind)) return null;
  const came = task?.routing?.receivedModels?.[model] || null;
  if (!came) return { stage: 'to_come', came: null };
  const rank = (key) => statuses.findIndex((step) => step.key === key);
  const queued = Boolean(task?.routing?.queuedModels?.[model]) || (rank('in_queue') >= 0 && rank(status) >= rank('in_queue'));
  return { stage: queued ? 'in_queue' : 'received', came };
}

/** Production's decision for one model — printing, assembly — or null when it has none [server: Todo `routing.models`]. */
export const routeOf = (task, model) => (task?.routing?.models || []).find((row) => row && typeof row === 'object' && row.model === model) || null;

/**
 * The statuses one model may move to on its own workflow, cut to where its route ends here
 * [routeEndOf]: on Production, up to Handed to Printing for a printed model (printed and assembled
 * included — Printing hands it on), up to Handed to Assembly for one only assembled, up to Ready
 * for Dispatch for one with neither; on Printing, up to Handed to Assembly or Ready for Dispatch;
 * on Assembly, up to Ready for Dispatch [server: handoff.service `goesTo`, `movesFor`]. A model
 * with no decision yet keeps the task's own list.
 */
export function statusesForModel(task, statuses = [], model) {
  /* A model whose goods have not reached this team: nothing it cannot say before they come. */
  if (goodsAwaited(task, model)) return statuses.filter((step) => !step.handsTo).filter(beforeGoods(statuses));
  const end = routeEndOf(task, model);
  return end ? trimToRoute(task, statuses, end) : statusesFor(task, statuses);
}

/** The rung after a model's status on its own ladder — issues and hand-overs it cannot take left out; null at the end. */
export function nextStepForModel(task, statuses = [], model, status) {
  const own = statusesForModel(task, statuses, model).filter((step) => !step.issue);
  const at = own.findIndex((step) => step.key === status);
  const current = statuses.find((step) => step.key === status);
  if (current?.done) return null;
  return own[at + 1] || null;
}

/** Where one model stands on its team's ladder: handed on, ready for dispatch or closed is through. */
export const modelThrough = (statuses = [], status) => {
  const step = statuses.find((entry) => entry.key === status);
  return Boolean(step?.handsTo || step?.readyForDispatch || step?.done);
};

/**
 * Days each finishing team gets before the EDD by default [server: settings.service
 * `handoverLeadDays` — the Production in charge, Admin or marketing may change it; callers pass
 * the plant's, utils/plantSettings.js `plantLead`].
 */
export const HANDOVER_LEAD_DAYS = 5;
const daysBefore = (day, count) => {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - count);
  /* A calendar day in, a calendar day out — noon Greenwich keeps it the same day. */
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
};
const daysApart = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** Marketing's EDD for one model — the one set for it, else the task's [server: Enquiry `eddByModel`]. */
export function eddForModel(task, model) {
  const row = model ? eddByModelOf(task?.enquiry).find((entry) => entry.model === model) : null;
  return row?.final?.date || eddOfTask(task)?.date || null;
}

/**
 * The finishing teams still to work on a model after this hand-over — the next one included:
 * from Production, Printing and Assembly for a model routed through both (2), else one; from
 * Printing, Assembly (1). Without a model, the most any of the task's models has.
 */
export function teamsAfter(task, model = null) {
  if (task?.kind === 'ask_edd') {
    const count = (row) => (row?.printing ? 1 : 0) + (row?.assembly ? 1 : 0);
    if (model) return count(routeOf(task, model));
    const rows = (task.routing?.models || []).filter((row) => row && typeof row === 'object');
    return rows.length ? Math.max(...rows.map(count)) : handsOnOf(task).length;
  }
  if (task?.kind === 'ask_printing') return handsOnOf(task).includes('assembling') ? 1 : 0;
  return 0;
}

/**
 * The hand-over day a form starts with: the days each team after this one gets, back from the
 * model's EDD — printed and assembled, to Printing 2 × `lead` before and to Assembly `lead`
 * before; never before `today`; '' with no EDD or no team after. A later day is allowed — the
 * dates are for reference, and the server only notes one on or after the EDD.
 */
export function handOverDefault(task, model = null, today = indiaToday(), lead = HANDOVER_LEAD_DAYS) {
  const edd = eddForModel(task, model);
  const teams = teamsAfter(task, model) || 1;
  if (!edd) return '';
  const day = daysBefore(edd, lead * teams);
  return day < today ? today : day;
}

/**
 * How a hand-over day sits: on or after the EDD; fewer days before it than the teams after this
 * one get; or — Printing handing to Assembly — fewer days for printing than a team gets since
 * Production handed the goods over. Null when it is fine.
 */
export function handOverWarning(task, model, day, lead = HANDOVER_LEAD_DAYS) {
  const edd = eddForModel(task, model);
  if (!day) return null;
  if (edd && day >= edd) return `On or after the EDD (${formatDate(edd)}) — for reference, it can still be saved`;
  const teams = teamsAfter(task, model) || 1;
  const gap = edd ? daysApart(day, edd) : null;
  if (gap != null && gap < lead * teams) {
    return `Only ${gap} day${gap === 1 ? '' : 's'} before the EDD (${formatDate(edd)}) — ${lead * teams} is the usual${teams > 1 ? ` (${lead} for Printing, ${lead} for Assembly)` : ''}`;
  }
  const from = task?.kind === 'ask_printing' ? task.routing?.incoming?.production : null;
  if (from) {
    const printing = daysApart(String(from).slice(0, 10), day);
    if (printing < lead) return `Only ${Math.max(printing, 0)} day${printing === 1 ? '' : 's'} for printing after Production hands over (${formatDate(from)}) — ${lead} is the usual`;
  }
  return null;
}
