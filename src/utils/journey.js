/**
 * Reading a model's journey [server: handoff.service `modelJourneys`] in one line: where the
 * model is now, in words, and how much of it has gone.
 */

const key = (model) => String(model || '').trim().toLowerCase();

/** The journey of one model, matched however its name was typed. */
export const journeyFor = (journeys = [], model) => journeys.find((row) => key(row.model) === key(model)) || null;

/**
 * The step the model is at: a problem first; else the furthest team working on it (Dispatch,
 * when part has gone); else the first step still waiting; else the last (all done).
 */
export function currentStep(row) {
  const steps = row?.steps || [];
  return steps.find((step) => step.state === 'issue')
    || [...steps].reverse().find((step) => step.state === 'now')
    || steps.find((step) => step.state === 'waiting')
    || steps.at(-1)
    || null;
}

/** Where the model is, in words: "Printing · Goods Received", "Part sent 10,000 of 16,000 pcs". */
export function whereWords(row) {
  const step = currentStep(row);
  if (!step) return 'Not with Production yet';
  if (step.team === 'dispatch') return step.state === 'done' ? `All sent${step.sent ? ` · ${step.sent.toLocaleString('en-IN')} pcs` : ''}` : step.status;
  return `${step.label} · ${step.status}`;
}

/** The tone of where it is: a problem, all gone, being worked on, or waiting. */
export function whereTone(row) {
  const step = currentStep(row);
  if (!step) return 'waiting';
  if (step.state === 'issue') return 'issue';
  if (step.team === 'dispatch' && step.state === 'done') return 'done';
  return step.state === 'now' ? 'now' : step.state === 'done' ? 'done' : 'waiting';
}

/** Pieces ordered and sent, from the Dispatch step. */
export function sentOf(row) {
  const step = (row?.steps || []).find((entry) => entry.team === 'dispatch');
  return { ordered: step?.ordered || 0, sent: step?.sent || 0 };
}
