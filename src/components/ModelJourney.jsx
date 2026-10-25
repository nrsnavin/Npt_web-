/**
 * Each model's own journey [server: handoff.service `modelJourneys`]: the steps its route takes —
 * Production, then Printing and Assembly where Production sent it, Quality where QC is compulsory,
 * then Dispatch — one line a model, each step saying where the model stands there. A model with
 * neither printing nor assembly reads Production → Dispatch. The mark beside each step (✓ done,
 * ● working on it, ! problem, ○ waiting) says it as well as the colour.
 */

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
          </p>
          <ol className="flex flex-wrap items-center gap-1" aria-label={`${row.model}: ${row.steps.map((step) => `${step.label} ${LOOK[step.state]?.words || step.state}`).join(', then ')}`}>
            {row.steps.map((step, index) => {
              const look = LOOK[step.state] || LOOK.waiting;
              return (
                <li key={step.team} className="flex items-center gap-1">
                  {index > 0 && <span className="text-steel-600" aria-hidden="true">→</span>}
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} ${look.chip}`}
                    title={`${step.label}: ${step.status}`}
                  >
                    <span aria-hidden="true">{look.mark}</span>
                    <span className="font-semibold">{step.label}</span>
                    {(!compact || step.state === 'now' || step.state === 'issue') && <span className="font-normal opacity-90">· {step.status}</span>}
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
