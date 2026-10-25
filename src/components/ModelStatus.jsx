import { Section } from './ui.jsx';
import { formatDate } from '../utils/format.js';
import { currentStep, sentOf, whereTone, whereWords } from '../utils/journey.js';

/**
 * Where each model of an order is, at a glance [server: records.service `enquiryRecords`
 * journeys]: the team it is with and that team's status (In Production, Goods Received for
 * Printing, In Assembly's work queue, Ready for Dispatch…), every step of its route as a chip,
 * and the pieces dispatched against the pieces ordered.
 */

const TONE = {
  issue: 'bg-danger-500/10 text-danger-400 ring-danger-500/30',
  done: 'bg-success-500/10 text-success-400 ring-success-500/30',
  now: 'bg-accent/10 text-accent ring-accent/30',
  waiting: 'bg-line/[0.05] text-steel-300 ring-line/[0.12]',
};
const MARK = { done: '✓', now: '●', issue: '!', waiting: '○' };
const CHIP = {
  done: 'text-success-400',
  now: 'font-semibold text-accent',
  issue: 'font-semibold text-danger-400',
  waiting: 'text-steel-500',
};

/** The route as a line of steps: ✓ done, ● working on it, ! problem, ○ waiting — the mark and the words, never colour alone. */
function Steps({ row }) {
  const at = currentStep(row);
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label={`${row.model}: ${row.steps.map((step) => `${step.label} ${step.status}`).join(', then ')}`}>
      {row.steps.map((step, index) => (
        <li key={step.team} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-steel-600" aria-hidden="true">→</span>}
          <span className={`${CHIP[step.state] || CHIP.waiting} ${step === at ? 'underline decoration-2 underline-offset-4' : ''}`} title={`${step.label}: ${step.status}${step.date ? ` · ${step.dateLabel} ${formatDate(step.date)}` : ''}`}>
            <span aria-hidden="true">{MARK[step.state] || '○'} </span>{step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Pieces dispatched against pieces ordered, as a thin bar with the numbers. */
function Sent({ row }) {
  const { ordered, sent } = sentOf(row);
  if (!ordered && !sent) return null;
  const share = ordered ? Math.min(100, Math.round((sent / ordered) * 100)) : 100;
  return (
    <div className="min-w-[9rem]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/[0.08]" role="img" aria-label={`${sent.toLocaleString('en-IN')}${ordered ? ` of ${ordered.toLocaleString('en-IN')}` : ''} pieces dispatched`}>
        <div className="h-1.5 rounded-full bg-success-500" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1 text-xs tabular-nums text-steel-400">
        <span className="font-semibold text-steel-200">{sent.toLocaleString('en-IN')}</span>{ordered ? ` of ${ordered.toLocaleString('en-IN')}` : ''} pcs sent
      </p>
    </div>
  );
}

/** Inside a model's own card: where it is, its route, and what has gone. */
export function ModelStatusStrip({ row }) {
  if (!row) return null;
  const tone = whereTone(row);
  return (
    <div className="mb-3 space-y-2 rounded-lg border border-line/[0.06] bg-ink-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE[tone]}`}>
          <span aria-hidden="true">{MARK[tone === 'done' ? 'done' : tone]}</span>{whereWords(row)}
        </span>
        <Sent row={row} />
      </div>
      <Steps row={row} />
    </div>
  );
}

/** The enquiry's one-glance card: one row a model. */
export default function ModelStatusGlance({ journeys = [] }) {
  if (!journeys.length) return null;
  return (
    <Section title="Where each model is">
      <ul className="divide-y divide-line/[0.06]">
        {journeys.map((row) => {
          const tone = whereTone(row);
          return (
            <li key={row.model} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-4">
              <p className="font-semibold text-steel-50">{row.model}</p>
              <div className="min-w-0 space-y-1.5">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset ${TONE[tone]}`}>
                  <span aria-hidden="true">{MARK[tone]}</span>{whereWords(row)}
                </span>
                <Steps row={row} />
                {(row.edd || row.completion) && (
                  <p className="text-xs text-steel-500">
                    EDD {row.edd ? formatDate(row.edd) : 'not set'}
                    {row.completion && <span className={row.late ? 'font-semibold text-danger-400' : ''}> · completion {formatDate(row.completion)}{row.late ? ' — after the EDD' : ''}</span>}
                  </p>
                )}
              </div>
              <Sent row={row} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
