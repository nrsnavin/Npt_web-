/**
 * A department task read at a glance [components/TaskCard.jsx, components/DepartmentDesk.jsx]:
 * what its status means (going well, stuck, finished, waiting), how far along its department's
 * ladder it is, which band of the enquiry's list it belongs in, and the one date that matters.
 *
 * The meaning comes from the workflow's own flags [server: config/departmentTaskForms.js]:
 * `issue` marks a step that is a problem (Mould Issue, Raw Material Not Available, Needs
 * Clarification, Promise Broken), `done` the step that finishes the task. The first step, and
 * any whose name says it is waiting on somebody, read as waiting; everything else is progress.
 */

import { statusesFor } from './edd.js';

export const TONES = ['progress', 'blocked', 'done', 'waiting'];

const WAITING_WORDS = /\b(waiting|awaiting|asked|pending|received|assigned|request)\b/i;

/** What a step on a ladder means: progress · blocked · done · waiting. */
export function toneOfStep(step, index = -1) {
  if (!step) return 'waiting';
  if (step.done) return 'done';
  if (step.issue) return 'blocked';
  if (index === 0 || WAITING_WORDS.test(step.label || '')) return 'waiting';
  return 'progress';
}

/** How the task ended, or the outcome kinds a timeline carries, as a tone. */
export const toneOfKind = (kind) => ({
  done: 'done', moved: 'done', returned: 'blocked', asked_again: 'blocked', notice: 'blocked', date: 'waiting',
  status: 'progress', raised: 'waiting', note: 'waiting', asked: 'waiting', corrected: 'waiting', uploaded: 'progress',
}[kind] || 'waiting');

/**
 * The department's ladder as the stepper draws it: the steps that are progress (the problem
 * steps sit beside the ladder, not on it), how far the task has climbed, and the step after.
 *
 *   { steps, reached, current, next, blocked, total }
 *
 * `reached` is the highest rung the task has stood on — so a task now at Mould Issue still shows
 * how far it got, in the blocked colour; `next` is the rung after that, the obvious move.
 */
export function ladderOf(button, task) {
  /* Cut to where the task's route ends on this team [edd.js `statusesFor`]. */
  const all = statusesFor(task, button?.form?.statuses || []);
  if (!all.length) return null;
  const steps = all.filter((step) => !step.issue);
  const current = all.find((step) => step.key === task.status) || null;
  const visited = new Set((task.updates || []).filter((update) => update.kind === 'status' && update.status).map((update) => update.status));
  if (task.status) visited.add(task.status);
  let reached = -1;
  steps.forEach((step, index) => { if (visited.has(step.key)) reached = Math.max(reached, index); });
  if (reached < 0 && !task.completed) reached = 0;
  const blocked = Boolean(current?.issue);
  const finished = Boolean(task.completed || current?.done);
  const next = finished ? null : steps[reached + 1] || null;
  return { steps, reached, current, next, blocked, finished, total: steps.length };
}

/**
 * The task's state in one word, and its tone: the step it is at, or how it ended.
 * `{ label, tone, step }`
 */
export function stateOf(task, button) {
  if (task.outcome?.result === 'returned') return { label: 'Sent back', tone: 'blocked' };
  if (task.outcome?.result === 'moved') return { label: 'Moved on', tone: 'done' };
  if (task.outcome?.result === 'closed_by_admin') return { label: 'Closed by Admin', tone: 'done' };
  const statuses = button?.form?.statuses || [];
  const index = statuses.findIndex((entry) => entry.key === task.status);
  const step = index >= 0 ? statuses[index] : null;
  if (task.completed) return { label: step?.done ? step.label : 'Done', tone: 'done', step };
  if (step) return { label: step.label, tone: toneOfStep(step, index), step };
  if (task.user?.name) return { label: `With ${task.user.name}`, tone: 'progress' };
  return { label: 'Not picked up yet', tone: 'waiting' };
}

/**
 * Which band of the enquiry's list a task sits in: `needs_you` (open, and yours or your
 * department's to work), `in_progress` (open, with somebody else) or `done`.
 */
export function bandOf(task, button, { me = '', worksIn = () => false, owner = '' } = {}) {
  if (task.completed) return 'done';
  const mine = String(task.user?._id || task.user || '') === String(me) && Boolean(me);
  const ownersTurn = button?.department === 'owner' && String(owner) === String(me) && Boolean(me);
  if (mine || ownersTurn || worksIn(task.department)) return 'needs_you';
  return 'in_progress';
}

/**
 * The one date a reader wants beside the task: the ready date the department gave (the latest
 * status that carried one), else when it is due — late if that has passed — else when it was
 * finished. `{ label, date, late }` or null.
 */
export function whenOf(task, { now = new Date() } = {}) {
  const dated = [...(task.updates || [])].reverse().find((update) => update.date && (update.kind === 'status' || !update.kind));
  if (dated && !task.completed) return { label: dated.dateLabel?.split(' / ').pop() || 'Ready', date: dated.date, late: false };
  if (task.completed) return task.completedAt ? { label: 'Done', date: task.completedAt, late: false } : null;
  if (task.dueDate) return { label: 'Due', date: task.dueDate, late: new Date(task.dueDate) < now };
  return null;
}

/** The newest thing somebody wrote on the task — the line the collapsed card shows. */
export function latestOf(entries) {
  if (!entries?.length) return null;
  const spoken = entries.filter((entry) => entry.kind !== 'raised' || entries.length === 1);
  return spoken[spoken.length - 1] || entries[entries.length - 1];
}
