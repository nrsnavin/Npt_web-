import { Fragment } from 'react';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { briefSections } from '../utils/taskForm.js';
import { timelineOf } from '../utils/taskHistory.js';
import { toneOfKind, toneOfStep } from '../utils/taskState.js';
import { formatDate, formatDateTime, formatRelative, initialsOf, isoDay } from '../utils/format.js';

/**
 * A department task, read: what was asked as a facts table, and everything that happened on it
 * as a conversation — each entry under the day it happened, with who said it (once per run of
 * entries by the same person), when (as "2 h ago", the exact time on hover), the step it moved
 * to as a chip whose colour says what it means, and the person's own words under it
 * [utils/taskHistory.js, utils/taskState.js]. Shared by the enquiry's task cards, the task panel
 * and the desk lists, so a task reads the same wherever it is opened.
 */

/** A step or an outcome as a chip: progress · blocked · done · waiting. */
export const CHIP = {
  progress: 'bg-accent/15 text-accent',
  blocked: 'bg-danger-500/15 text-danger-400',
  done: 'bg-success-500/15 text-success-400',
  waiting: 'bg-line/[0.08] text-steel-300',
};
const WORDS = { note: 'Update', asked_again: 'Asked again' };

/** What an entry means, by the step it names or the kind of thing it is. */
export function toneOfEntry(entry, statuses = []) {
  if (entry.kind === 'status') {
    const index = statuses.findIndex((step) => (entry.status ? step.key === entry.status : step.label === entry.statusLabel));
    return index >= 0 ? toneOfStep(statuses[index], index) : 'progress';
  }
  return toneOfKind(entry.kind);
}

/** "Today", "Yesterday", or the date — the divider between one day's entries and the next. */
const dayHeading = (at, now = new Date()) => {
  const day = isoDay(at);
  if (day === isoDay(now)) return 'Today';
  if (day === isoDay(new Date(now.getTime() - 86400000))) return 'Yesterday';
  return formatDate(at);
};

/**
 * What the task was asked, as it was entered [utils/taskForm.js `briefSections`]: the answers as
 * label / value rows, the boxes ticked (or left unticked where that matters), and each model of a
 * table as its own block — parts by name, pieces × price, EDD — with the total under them.
 */
export function TaskFacts({ button, task, className = '' }) {
  const { facts, checks, tables } = briefSections(button, task.brief);
  if (!facts.length && !checks.length && !tables.length) return null;
  return (
    <div className={`space-y-2 text-xs ${className}`}>
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {facts.map((entry) => (
            <div key={entry.key} className="contents">
              <dt className="text-steel-500">{entry.label}</dt>
              <dd className="min-w-0 break-words text-steel-200">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {tables.map((table) => (
        <div key={table.key} className="space-y-1">
          <p className="font-semibold text-steel-400">{table.label}</p>
          <ol className="space-y-1">
            {table.rows.map((row, index) => (
              <li key={`${row.title}-${index}`} className="rounded-md border border-line/[0.06] bg-line/[0.03] px-2 py-1.5">
                <p className="text-sm font-semibold text-steel-50">{row.title}</p>
                {row.parts.length > 0 && (
                  <p className="text-steel-300">
                    {row.parts.map((part, at) => (
                      <span key={part.label}>{at > 0 && ' · '}<span className="text-steel-500">{part.label}</span> {part.value}</span>
                    ))}
                  </p>
                )}
                {row.amount && <p className="font-semibold text-steel-100">{row.amount}</p>}
              </li>
            ))}
          </ol>
          {table.total && <p className="text-right font-semibold text-steel-200">Total: {table.total}</p>}
        </div>
      ))}
      {checks.map((check) => (
        <p key={check.key} className={`font-semibold ${check.ticked ? 'text-success-400' : 'text-warn-400'}`}>
          {check.ticked ? `✓ ${check.label}` : `✗ Not ticked — ${check.label}`}
        </p>
      ))}
    </div>
  );
}

/**
 * Everything that happened on the task, oldest first. `entries` may be given ready-made — the
 * enquiry's timeline across every task passes them, each with a `source` naming its task —
 * otherwise they are read off the task. `compact` keeps the last three.
 */
export function TaskTimeline({ task, button, entries: given, className = '', compact = false }) {
  const catalogue = useHandoffCatalogue();
  const labelOf = (kind) => catalogue?.buttons?.find((entry) => entry.key === kind)?.label || 'next step';
  const statuses = button?.form?.statuses || [];
  const entries = given || timelineOf(task, button, { labelOf });
  const shown = compact ? entries.slice(-3) : entries;
  if (!shown.length) return null;
  const nameOf = (entry) => entry.by?.name || 'Someone';
  return (
    <ol className={`space-y-1.5 ${className}`} aria-label="What happened on this task">
      {compact && entries.length > shown.length && (
        <li className="text-xs text-steel-500">{entries.length - shown.length} earlier …</li>
      )}
      {shown.map((entry, index) => {
        const previous = shown[index - 1];
        const newDay = !previous || isoDay(previous.at) !== isoDay(entry.at);
        /* The same person again, the same day: their name and marker are not repeated. */
        const sameAuthor = Boolean(previous) && !newDay && nameOf(previous) === nameOf(entry) && previous.source === entry.source;
        const tone = toneOfEntry(entry, entry.statuses || statuses);
        return (
          <Fragment key={`${entry.at}-${index}`}>
            {newDay && !compact && (
              <li className="flex items-center gap-2 pt-1 text-xs text-steel-500" aria-hidden>
                <span className="h-px flex-1 bg-line/[0.08]" />
                {dayHeading(entry.at)}
                <span className="h-px flex-1 bg-line/[0.08]" />
              </li>
            )}
            <li className="grid grid-cols-[1.75rem_1fr] gap-x-2">
              <span
                aria-hidden
                className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${sameAuthor ? 'invisible' : 'bg-line/[0.1] text-steel-200'}`}
              >
                {initialsOf(nameOf(entry))}
              </span>
              <div className="min-w-0 rounded-xl bg-line/[0.04] px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  {!sameAuthor && <span className="font-semibold text-steel-100">{nameOf(entry)}</span>}
                  {entry.source && !sameAuthor && <span className="text-steel-400">{entry.source}</span>}
                  <time className="text-steel-500" dateTime={entry.at} title={formatDateTime(entry.at)}>{formatRelative(entry.at)}</time>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[tone]}`}>{entry.statusLabel || WORDS[entry.kind] || 'Update'}</span>
                  {entry.date && <span className="text-xs text-steel-300">{entry.dateLabel || 'Ready date'} <span className="font-semibold text-steel-100">{entry.date}</span></span>}
                </p>
                {entry.text && <p className="mt-1 whitespace-pre-line break-words text-sm text-steel-100">{entry.text}</p>}
                {entry.facts?.length > 0 && (
                  <p className="mt-1 text-xs text-steel-400">{entry.facts.map((fact) => `${fact.label}: ${fact.value}`).join(' · ')}</p>
                )}
                {entry.next && <p className="mt-1 text-xs text-steel-400">→ {entry.next}</p>}
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
