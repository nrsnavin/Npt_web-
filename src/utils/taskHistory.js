/**
 * A department task's history as one list, in order, each entry in its parts — what kind of
 * thing happened (a move on the workflow, a plain update, a date change, done), its step, its
 * date, the person's own words, who and when — so a screen draws it as a timeline rather than
 * one sentence per line [server: models/Todo.js `updates`, components/TaskHistory.jsx].
 *
 * Updates written before the parts were kept carry only the one-line `note`; `readUpdate` takes
 * those apart by their fixed shapes ("Started: on M3", "Ready for Dispatch · Ready date 2026-10-15:
 * packed", "Navin R asked again: …"), and leaves anything else as the plain note it is.
 */

/** "12 Oct 2026" from "2026-10-12", or the value as given. */
const dayWords = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value;
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const DATE_IN_NOTE = /^(.*?) · ([^:]+?) (\d{4}-\d{2}-\d{2})$/;

/** One update, taken apart: `{ kind, statusLabel, date, dateLabel, text, fields, by, at }`. */
export function readUpdate(update, statuses = []) {
  const base = { by: update.by, at: update.at, fields: update.fields };
  if (update.kind) {
    return {
      ...base, kind: update.kind, statusLabel: update.statusLabel, status: update.status,
      date: update.date, dateLabel: update.dateLabel, text: update.text,
    };
  }
  const note = String(update.note || '');
  const again = note.match(/^(.+?) asked again: (.*)$/s);
  if (again) return { ...base, kind: 'asked_again', text: again[2] === 'Asked again' ? undefined : again[2] };
  const split = note.indexOf(': ');
  if (split > 0 && split < 120) {
    const head = note.slice(0, split);
    const rest = note.slice(split + 2);
    const dated = head.match(DATE_IN_NOTE);
    const label = dated ? dated[1] : head;
    const known = statuses.some((entry) => entry.label === label);
    if (dated && known) return { ...base, kind: 'status', statusLabel: label, dateLabel: dated[2], date: dated[3], text: rest || undefined };
    if (known) return { ...base, kind: 'status', statusLabel: label, text: rest || undefined };
  }
  const datedOnly = note.match(DATE_IN_NOTE);
  if (datedOnly && statuses.some((entry) => entry.label === datedOnly[1])) {
    return { ...base, kind: 'status', statusLabel: datedOnly[1], dateLabel: datedOnly[2], date: datedOnly[3] };
  }
  if (statuses.some((entry) => entry.label === note)) return { ...base, kind: 'status', statusLabel: note };
  return { ...base, kind: 'note', text: note };
}

const OUTCOME = { done: 'Done', returned: 'Sent back', moved: 'Moved on', closed_by_admin: 'Closed by Admin' };

/**
 * Everything that happened on a task, oldest first: raised, every update, every date change,
 * and how it ended. `button` is the task's catalogue entry (for the status labels and the
 * recorded fields' labels); `labelOf(kind)` names the next step a done task moved on to.
 */
export function timelineOf(task, button, { labelOf = (kind) => kind } = {}) {
  const statuses = button?.form?.statuses || [];
  const entries = [];
  if (task.createdAt) {
    entries.push({ kind: 'raised', at: task.createdAt, by: task.createdBy, text: task.notes || undefined, statusLabel: 'Raised' });
  }
  for (const update of task.updates || []) entries.push(readUpdate(update, statuses));
  for (const change of task.reschedules || []) {
    entries.push({ kind: 'date', at: change.at, by: change.by, statusLabel: `Date moved to ${dayWords(String(change.to || '').slice(0, 10))}`, text: change.reason });
  }
  if (task.outcome?.result && task.outcome.at) {
    const fields = task.outcome.fields ? Object.entries(task.outcome.fields) : [];
    entries.push({
      kind: task.outcome.result,
      at: task.outcome.at,
      by: task.outcome.by,
      statusLabel: OUTCOME[task.outcome.result] || 'Done',
      text: task.outcome.note || undefined,
      facts: fields.map(([key, value]) => ({ key, label: button?.records?.find((record) => record.key === key)?.label || key, value })),
      next: task.outcome.next ? labelOf(task.outcome.next) : undefined,
    });
  }
  return entries
    .map((entry) => ({ ...entry, date: entry.date ? dayWords(entry.date) : undefined }))
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
}
