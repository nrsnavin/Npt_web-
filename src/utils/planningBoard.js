/**
 * Placing work orders on the planning board's day columns [pages/PlanningBoard.jsx; server:
 * planning.service `planningBoard`]. Days are compared as India calendar days.
 */
import { todayInIndia } from './taskForm.js';

/* A board day is 'YYYY-MM-DD' already; a stored moment becomes its India calendar day. */
const dayOf = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  return todayInIndia(new Date(value));
};

/** Which columns a job covers on the board, clipped to the days shown; null when outside them. */
export function barSpan(job, days) {
  if (!job?.plannedStart || !job?.plannedEnd || !days?.length) return null;
  const keys = days.map((entry) => dayOf(entry.day));
  const start = dayOf(job.plannedStart);
  const end = dayOf(job.plannedEnd);
  if (end < keys[0] || start > keys.at(-1)) return null;
  const from = start < keys[0] ? 0 : keys.indexOf(start);
  const to = end > keys.at(-1) ? keys.length - 1 : keys.indexOf(end);
  if (from < 0 || to < 0) return null;
  return { from, to, clippedLeft: start < keys[0], clippedRight: end > keys.at(-1) };
}

/** A day's load as a share of the press's hours — over 100% is double-booked. */
export const loadShare = (hours, hoursPerDay) => (hoursPerDay ? Math.round((hours / hoursPerDay) * 100) : 0);

/** The bar's colour from where the job stands. */
export const BAR_TONE = {
  running: 'bg-success-500/80 text-white',
  released: 'bg-accent/80 text-white',
  planned: 'bg-steel-500/70 text-white',
  paused: 'bg-warn-500/80 text-white',
};

/** "Mon 19" — a column heading. */
export const dayHeading = (value) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit' }).format(new Date(value));
/** The month a day opens, for the board's header — "Nov" on the 1st (and on the board's first day), else ''. */
export const monthMark = (day, first = false) => (first || String(day).slice(8, 10) === '01'
  ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).format(new Date(`${String(day).slice(0, 10)}T12:00:00+05:30`))
  : '');
/** The board's grid: the press column, then a fixed width a day — the board scrolls across past the screen. */
export const DAY_WIDTH_REM = 3.5;
export const PRESS_WIDTH_REM = 11;
export const boardColumns = (days) => `${PRESS_WIDTH_REM}rem repeat(${days}, ${DAY_WIDTH_REM}rem)`;
export const boardWidth = (days) => `${PRESS_WIDTH_REM + days * DAY_WIDTH_REM}rem`;

/**
 * A press ranking [server: pressScore.service `rankPresses`] indexed by press, for tagging the
 * board's rows while a job is dragged: `byPress[id]` the choice, `cannot[id]` why not, `best`.
 */
export function indexChoices(result) {
  const byPress = {};
  const cannot = {};
  for (const choice of result?.choices || []) byPress[String(choice.machine._id)] = choice;
  for (const entry of result?.cannot || []) cannot[String(entry.machine._id)] = entry.why;
  return { byPress, cannot, best: result?.choices?.[0] || null, why: result?.sized === false ? result.why : null };
}

/** "Best", "2nd", "3rd", then "4th"… — what a planner reads first on a press. */
export const rankWords = (rank) => (rank === 1 ? 'Best' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`);

/** The colour of a rank; the words always sit beside it. */
export const RANK_TONE = {
  1: 'border-success-500/50 bg-success-500/10 text-success-400',
  2: 'border-accent/50 bg-accent/10 text-accent',
  3: 'border-accent/40 bg-accent/[0.06] text-accent',
};

/** "28 Oct" — a day short enough for a tag. */
export const shortDay = (value) => (value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(value)) : '');

/*
 * A hanger colour as a swatch beside its name. The name is always written too; the swatch only
 * helps the eye find "the black ones". The first match wins, so the specific names (navy, wine,
 * charcoal) sit before the general ones (blue, red, grey).
 */
const SWATCHES = [
  [['natural', 'clear', 'transparent', 'crystal'], 'clear'],
  [['milky', 'white'], '#f8fafc'], [['ivory'], '#fffbe8'], [['cream'], '#f6ecd0'], [['beige'], '#e2d3b4'],
  [['lemon'], '#fde047'], [['yellow'], '#facc15'], [['gold'], '#d4a017'], [['silver'], '#c0c4cc'],
  [['peach'], '#ffc29e'], [['orange'], '#f97316'], [['pink'], '#f472b6'], [['maroon'], '#7f1d1d'], [['wine'], '#722f37'],
  [['red'], '#dc2626'], [['lavender'], '#c4b5fd'], [['violet'], '#8b5cf6'], [['purple'], '#7e22ce'],
  [['navy'], '#1e3a8a'], [['sky'], '#38bdf8'], [['aqua'], '#22d3ee'], [['teal'], '#0d9488'], [['blue'], '#2563eb'],
  [['olive'], '#6b7d2a'], [['green'], '#16a34a'], [['chocolate', 'coffee'], '#4a2c17'], [['brown'], '#7c4a1e'],
  [['charcoal'], '#36454f'], [['grey', 'gray'], '#9ca3af'], [['black'], '#111111'],
];
/** The swatch for a colour name: a CSS colour, 'clear' for a see-through resin, or null if unknown. */
export function swatchOf(colour) {
  const text = String(colour || '').toLowerCase();
  if (!text) return null;
  return SWATCHES.find(([words]) => words.some((word) => text.includes(word)))?.[1] || null;
}

const dayKey = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  return todayInIndia(new Date(value));
};

/**
 * One press as its card shows it: the job running on it (with how far along it is), the jobs
 * after it, when it is free, and its state in a word.
 */
export function pressSummary(press, today = todayInIndia()) {
  const queue = press?.queue || [];
  const running = queue.find((job) => job.status === 'running') || null;
  const upcoming = queue.filter((job) => job !== running);
  const progress = running && running.quantity ? Math.min(100, Math.round(((running.goodQty || 0) / running.quantity) * 100)) : null;
  const lastEnd = queue.reduce((last, job) => {
    const end = dayKey(job.plannedEnd);
    return end && (!last || end > last) ? end : last;
  }, null);
  const status = press?.machine?.status;
  const state = status === 'breakdown' ? 'down' : status === 'maintenance' ? 'service' : running ? 'running' : queue.length ? 'booked' : 'free';
  return {
    running, upcoming, progress, state,
    freeFrom: queue.length && lastEnd && lastEnd >= today ? lastEnd : null,
    late: queue.some((job) => job.late),
  };
}

/** The words and colours of a press's state — the dot is never the only sign. */
export const PRESS_STATE = {
  running: { words: 'Running', dot: 'bg-success-500', pill: 'bg-success-500/10 text-success-400', pulse: true },
  booked: { words: 'Booked', dot: 'bg-aqua-500', pill: 'bg-aqua-500/10 text-aqua-300' },
  free: { words: 'Free', dot: 'bg-steel-500', pill: 'bg-line/[0.06] text-steel-300' },
  down: { words: 'Broken down', dot: 'bg-danger-500', pill: 'bg-danger-500/10 text-danger-400' },
  service: { words: 'In maintenance', dot: 'bg-warn-500', pill: 'bg-warn-500/10 text-warn-400' },
};

/** The figures across the top of the board. */
export function boardStats(board, today = todayInIndia()) {
  const summaries = (board?.presses || []).map((press) => pressSummary(press, today));
  return {
    presses: summaries.length,
    running: summaries.filter((entry) => entry.state === 'running').length,
    free: summaries.filter((entry) => entry.state === 'free').length,
    down: summaries.filter((entry) => entry.state === 'down' || entry.state === 'service').length,
    waiting: (board?.unplanned || []).length,
    late: (board?.unplanned || []).filter((job) => job.late).length
      + (board?.presses || []).reduce((sum, press) => sum + press.queue.filter((job) => job.late).length, 0),
  };
}

/** Presses grouped by the bay they stand in, in the board's order; no bay goes last. */
export function byBay(presses = []) {
  const groups = new Map();
  for (const press of presses) {
    const bay = press.machine?.location || '';
    if (!groups.has(bay)) groups.set(bay, []);
    groups.get(bay).push(press);
  }
  return [...groups.entries()].sort(([a], [b]) => (a ? (b ? a.localeCompare(b, 'en', { numeric: true }) : -1) : 1)).map(([bay, list]) => ({ bay, presses: list }));
}

/** Waiting jobs filtered by what was typed (and `only`) and ordered as asked: late first, by due day, or biggest. */
export function sortWaiting(jobs = [], { search = '', order = 'late', lateOnly = false, only = null } = {}) {
  const words = search.trim().toLowerCase();
  /* `only`: Production-task models with no proposal, the auto-planner's proposals [floor planning], or jobs no press can take. */
  const kept = (job) => (only === 'tasks' ? Boolean(job.forTask && !job.proposal) : only === 'proposed' ? Boolean(job.proposal)
    : only === 'blocked' ? Boolean(job.best && !job.best.machine) : true);
  const found = jobs.filter((job) => (!lateOnly || job.late) && kept(job) && (!words || [job.number, job.mould?.mouldCode, job.modelNumber, job.colour, job.customer, job.order]
    .some((value) => String(value || '').toLowerCase().includes(words))));
  const due = (job) => String(job.dueDate || '9');
  const sorters = {
    late: (a, b) => Number(Boolean(b.late)) - Number(Boolean(a.late)) || due(a).localeCompare(due(b)),
    due: (a, b) => due(a).localeCompare(due(b)),
    big: (a, b) => (b.toMake || 0) - (a.toMake || 0),
  };
  return [...found].sort(sorters[order] || sorters.late);
}

/** The weightage the in charge picks from [components/planning/Weightage.jsx; server: priorityQueue `weightOf`]. */
export const WEIGHT_PRESETS = [
  { value: 3, label: 'Low' }, { value: 5, label: 'Normal' }, { value: 7, label: 'High' }, { value: 9, label: 'Urgent' }, { value: 10, label: 'Top' },
];
/** A weight in words: 10 top, 8–9 urgent, 6–7 high, 4–5 normal, below low. */
export const weightWords = (weight) => (weight >= 10 ? 'top' : weight >= 8 ? 'urgent' : weight >= 6 ? 'high' : weight >= 4 ? 'normal' : 'low');
