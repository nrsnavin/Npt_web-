import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { briefEntries } from '../utils/taskForm.js';
import { timelineOf } from '../utils/taskHistory.js';
import { formatDateTime } from '../utils/format.js';

/**
 * A department task, read: what was asked as a facts table, and everything that happened on it
 * as a timeline — each line a step or a kind of event in a badge, the person's own words under
 * it, who and when beside it [utils/taskHistory.js]. Shared by the enquiry's task list, the
 * task panel and the desk, so a task reads the same wherever it is opened.
 */
const TONE = {
  status: 'bg-accent/15 text-accent',
  raised: 'bg-line/[0.08] text-steel-300',
  note: 'bg-line/[0.08] text-steel-300',
  asked_again: 'bg-warn-500/15 text-warn-400',
  asked: 'bg-accent/15 text-accent',
  corrected: 'bg-line/[0.08] text-steel-300',
  uploaded: 'bg-line/[0.08] text-steel-300',
  notice: 'bg-warn-500/15 text-warn-400',
  date: 'bg-warn-500/15 text-warn-400',
  done: 'bg-success-500/15 text-success-400',
  returned: 'bg-danger-500/15 text-danger-400',
  moved: 'bg-success-500/15 text-success-400',
};
const WORDS = { note: 'Update', asked_again: 'Asked again' };

/** What the task was asked, as label / value rows. */
export function TaskFacts({ button, task, className = '' }) {
  const entries = briefEntries(button, task.brief);
  if (!entries.length) return null;
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs ${className}`}>
      {entries.map((entry) => (
        <div key={entry.key} className="contents">
          <dt className="text-steel-500">{entry.label}</dt>
          <dd className="min-w-0 break-words text-steel-200">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Everything that happened on the task, oldest first. */
export function TaskTimeline({ task, button, className = '', compact = false }) {
  const catalogue = useHandoffCatalogue();
  const labelOf = (kind) => catalogue?.buttons?.find((entry) => entry.key === kind)?.label || 'next step';
  const entries = timelineOf(task, button, { labelOf });
  const shown = compact ? entries.slice(-3) : entries;
  if (!shown.length) return null;
  return (
    <ol className={`space-y-2 ${className}`} aria-label="What happened on this task">
      {compact && entries.length > shown.length && (
        <li className="text-xs text-steel-500">{entries.length - shown.length} earlier …</li>
      )}
      {shown.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="grid grid-cols-[auto_1fr] gap-x-2.5 text-xs">
          <span aria-hidden className={`mt-1.5 h-2 w-2 rounded-full ${entry.kind === 'done' || entry.kind === 'moved' ? 'bg-success-500' : entry.kind === 'returned' ? 'bg-danger-500' : entry.kind === 'status' ? 'bg-accent' : 'bg-line/40'}`} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${TONE[entry.kind] || TONE.note}`}>{entry.statusLabel || WORDS[entry.kind] || 'Update'}</span>
              {entry.date && <span className="text-steel-300">{entry.dateLabel || 'Ready date'} <span className="font-semibold text-steel-100">{entry.date}</span></span>}
              <span className="text-steel-500">{entry.by?.name || 'Someone'} · {formatDateTime(entry.at)}</span>
            </p>
            {entry.text && <p className="mt-0.5 whitespace-pre-line break-words text-steel-200">{entry.text}</p>}
            {entry.facts?.length > 0 && (
              <p className="mt-0.5 text-steel-400">{entry.facts.map((fact) => `${fact.label}: ${fact.value}`).join(' · ')}</p>
            )}
            {entry.next && <p className="mt-0.5 text-steel-400">→ {entry.next}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
