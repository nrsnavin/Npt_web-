/**
 * Each model's own journey [server: handoff.service `modelJourneys`]: the steps its route takes —
 * Production, then Printing and Assembly where Production sent it, Quality where QC is compulsory,
 * then Dispatch — one line a model, each step saying where the model stands there. A model with
 * neither printing nor assembly reads Production → Dispatch. The mark beside each step (✓ done,
 * ● working on it, ! problem, ○ waiting) says it as well as the colour.
 *
 * Dates, model by model: each team's hand-over date where the model goes on to the next team, the
 * last team's completion date where it ends there — the model's estimated completion — beside
 * marketing's EDD for it, in red when the completion falls after the EDD.
 */
import { formatDate } from '../utils/format.js';

/* A short day for the chips: "28 Oct". */
const day = (date) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const LOOK = {
  done: { mark: '✓', chip: 'border-success-500/40 bg-success-500/10 text-success-400', words: 'done' },
  now: { mark: '●', chip: 'border-accent/50 bg-accent/10 text-accent', words: 'working on it' },
  issue: { mark: '!', chip: 'border-danger-500/50 bg-danger-500/10 text-danger-400', words: 'problem' },
  waiting: { mark: '○', chip: 'border-line/[0.12] bg-line/[0.03] text-steel-400', words: 'waiting' },
};

export default function ModelJourney({ journeys = [], compact = false }) {
  if (!journeys.length) return null;
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-3'} aria-label="Each model’s journey">
      {journeys.map((row) => (
        <li key={row.model} className={compact ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : 'space-y-1.5'}>
          <p className={compact ? 'min-w-[5.5rem] text-xs font-semibold text-steel-100' : 'text-sm font-semibold text-steel-50'}>
            {row.model}
            {!compact && !row.decided && <span className="ml-2 text-xs font-normal text-warn-400">printing / assembly not decided yet</span>}
            {/* The model's own EDD and its estimated completion — the last team's date. */}
            {!compact && (
              <span className="ml-2 text-xs font-normal text-steel-400">
                EDD {row.edd ? formatDate(row.edd) : 'not set'}
                {' · '}
                <span className={row.late ? 'font-semibold text-danger-400' : ''}>
                  Completion {row.completion ? formatDate(row.completion) : 'not given yet'}{row.late ? ' — after the EDD' : ''}
                </span>
              </span>
            )}
          </p>
          <ol className="flex flex-wrap items-center gap-1" aria-label={`${row.model}: ${row.steps.map((step) => `${step.label} ${LOOK[step.state]?.words || step.state}`).join(', then ')}`}>
            {row.steps.map((step, index) => {
              const look = LOOK[step.state] || LOOK.waiting;
              return (
                <li key={step.team} className="flex items-center gap-1">
                  {index > 0 && <span className="text-steel-600" aria-hidden="true">→</span>}
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} ${look.chip}`}
                    title={`${step.label}: ${step.status}${step.date ? ` · ${step.dateLabel} ${formatDate(step.date)}` : ''}`}
                  >
                    <span aria-hidden="true">{look.mark}</span>
                    <span className="font-semibold">{step.label}</span>
                    {(!compact || step.state === 'now' || step.state === 'issue') && <span className="font-normal opacity-90">· {step.status}</span>}
                    {/* Its hand-over date (to the next team) or completion date. */}
                    {step.date && (
                      <span className="font-normal tabular-nums opacity-90">· {compact ? '' : `${step.dateKind === 'handover' ? 'hand-over' : 'completion'} `}{day(step.date)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ul>
  );
}
