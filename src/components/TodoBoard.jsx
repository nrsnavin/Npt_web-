import { useState } from 'react';
import { useWorkspace } from './dock/WorkspaceContext.jsx';
import { ScopeTabs, TodoRow, dueLabel } from './dock/TodoPanel.jsx';
import { EscalateTaskDialog } from './TaskEscalation.jsx';
import { Notice, Section } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';

/**
 * The day's tasks, on the dashboard rather than behind a dock icon.
 *
 * They lived in a panel in the bottom-right corner, which is the wrong place for the thing the
 * morning is planned from: it had to be opened to be read, so the tasks the system raises
 * itself — prepare this sample, price this enquiry, raise the sales order — were invisible on
 * the one screen somebody looks at before deciding what to do. A queue nobody sees is a queue
 * that gets worked from memory instead.
 *
 * **Grouped by when, not listed by when.** "Nine tasks" is a number; "three of them are late"
 * is the thing worth knowing before nine o'clock. Overdue is separated because it is a
 * different problem from busy, and the rest is split at today so the day has an edge.
 *
 * The dock panel stays as it was. This is where the day is read; that is where a task is
 * captured without leaving whatever screen you are on, and they are the same list either way.
 */

/** Which bucket a task falls in, on the same midnight-to-midnight rule the panel uses. */
function bucketOf(todo) {
  if (!todo.dueDate) return 'someday';

  const due = new Date(todo.dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return 'later';
}

const GROUPS = [
  { key: 'overdue', title: 'Late', tone: 'text-danger-400' },
  { key: 'today', title: 'Today', tone: 'text-warn-400' },
  { key: 'later', title: 'Coming up', tone: 'text-steel-400' },
  { key: 'someday', title: 'No date', tone: 'text-steel-500' },
];

export default function TodoBoard() {
  const {
    todos, todoMeta, scope, setScope, addTodo, saveTodo, removeTodo, escalateTodo,
  } = useWorkspace();
  const [escalating, setEscalating] = useState(null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const open = todos.filter((todo) => !todo.completed);
  const done = todos.filter((todo) => todo.completed);

  const buckets = Object.fromEntries(GROUPS.map((group) => [group.key, []]));
  for (const todo of open) buckets[bucketOf(todo)].push(todo);

  // Worst first inside each group, so the oldest late thing is the first thing read.
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  }

  const late = buckets.overdue.length;
  const today = buckets.today.length;

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await addTodo({ title: title.trim(), dueDate: dueDate || undefined, priority });
      setTitle('');
      setDueDate('');
      setPriority('normal');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (todo) => saveTodo({ id: todo._id, completed: !todo.completed });
  const claim = (todo, take) => saveTodo({ id: todo._id, claim: take });

  /* Marketing's window on a buyer's work is read-only [§29]. */
  const readOnly = scope === 'customers';

  /* Each list is empty for a different reason, and "your list is clear" on the customers tab
     reads as though the buyer has nothing outstanding rather than as though nothing is stuck. */
  const emptyLine = {
    mine: 'Your list is clear.',
    department: 'Nothing on the queue. The whole department is clear.',
    customers: 'Nothing outstanding on your customers, in any department.',
  }[scope];

  /** The row's props, identical in all three places it is drawn. */
  const rowProps = {
    readOnly,
    showDepartment: scope !== 'department',
    onToggle: toggle,
    onDelete: removeTodo,
    onClaim: claim,
    onEscalate: setEscalating,
  };

  return (
    <Section
      title={
        { mine: 'Your tasks', department: `${departmentLabel(todoMeta?.department)} queue`,
          customers: 'Your customers' }[scope] || 'Tasks'
      }
      actions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDone(false)}
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              !showDone ? 'text-flame-400' : 'text-steel-400 hover:text-steel-200'
            }`}
          >
            To do ({open.length})
          </button>
          <button
            type="button"
            onClick={() => setShowDone(true)}
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              showDone ? 'text-flame-400' : 'text-steel-400 hover:text-steel-200'
            }`}
          >
            Done ({done.length})
          </button>
        </div>
      }
    >
      {/* Whose list is being read. The default is `mine`, because this is the screen somebody
          plans their own morning from — the queue is one press away, not in the way. */}
      <ScopeTabs scope={scope} setScope={setScope} meta={todoMeta} className="mb-3" />

      {/*
        * The headline, before the list. Somebody scanning this at nine o'clock wants to know
        * whether they are behind, which "nine tasks" does not tell them.
        */}
      {!showDone && scope !== 'customers' && (
        <p className="mb-3 text-xs leading-relaxed text-steel-400">
          {open.length === 0
            ? 'Nothing on your list. Anything the plant hands you will land here.'
            : late
              ? <>
                  <span className="font-semibold text-danger-400">{late} late</span>
                  {today ? `, ${today} due today` : ''} · {open.length} in all.
                </>
              : today
                ? <><span className="font-semibold text-warn-400">{today} due today</span> · {open.length} in all.</>
                : `${open.length} on your list, none due yet.`}
        </p>
      )}

      {/* A line for the window rather than the headline: what marketing wants here is not "am I
          behind" but "what is standing between my buyer and their delivery". */}
      {!showDone && scope === 'customers' && (
        <p className="mb-3 text-xs leading-relaxed text-steel-400">
          Every task on the buyers you own, whichever department is holding it. Read-only — hand
          one on if it needs doing sooner.
        </p>
      )}

      {/* Quick capture, in the place the list is read. Not on the customers tab: a task typed
          there would land on marketing's own queue, which is not what the tab is about. */}
      {!readOnly && (
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <input
          className="input min-w-[12rem] flex-1 py-1.5 text-xs"
          placeholder="Add a task…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          type="date"
          aria-label="Due date"
          className="input w-40 py-1.5 text-xs"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        <select
          aria-label="Priority"
          className="input w-24 py-1.5 text-xs"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <button type="submit" className="btn-primary px-3.5 py-1.5 text-xs" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>
      )}

      {error && <div className="mb-3"><Notice tone="danger">{error}</Notice></div>}

      {showDone ? (
        done.length ? (
          <ul className="divide-y divide-line/[0.04]">
            {done.slice(0, 20).map((todo) => (
              <TodoRow key={todo._id} todo={todo} {...rowProps} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-steel-500">Nothing finished yet today.</p>
        )
      ) : (
        <div className="space-y-4">
          {GROUPS.filter((group) => buckets[group.key].length).map((group) => (
            <div key={group.key}>
              <p className={`text-[0.75rem] font-bold uppercase tracking-[0.08em] ${group.tone}`}>
                {group.title} ({buckets[group.key].length})
              </p>
              <ul className="divide-y divide-line/[0.04]">
                {buckets[group.key].map((todo) => (
                  <TodoRow key={todo._id} todo={todo} {...rowProps} />
                ))}
              </ul>
            </div>
          ))}

          {!open.length && (
            <p className="py-6 text-center text-sm text-steel-500">{emptyLine}</p>
          )}
        </div>
      )}

      <EscalateTaskDialog
        task={escalating}
        open={Boolean(escalating)}
        onClose={() => setEscalating(null)}
        onEscalated={escalateTodo}
      />
    </Section>
  );
}

export { dueLabel };
