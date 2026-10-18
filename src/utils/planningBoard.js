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
