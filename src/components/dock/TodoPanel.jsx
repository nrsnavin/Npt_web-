import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from './WorkspaceContext.jsx';
import DockIcon from './DockIcon.jsx';
import { Notice } from '../ui.jsx';
import { EscalateTaskDialog, TaskMeta } from '../TaskEscalation.jsx';
import { formatDate } from '../../utils/format.js';
import { departmentLabel } from '../../utils/pipeline.js';

const PRIORITY_TONE = {
  high: 'text-danger-400',
  normal: 'text-steel-400',
  low: 'text-steel-500',
};

/**
 * Relative wording reads faster than a date when the date is near.
 *
 * Both dates are flattened to their own midnight before comparing: a task due at 5pm
 * yesterday is only seven hours before today's midnight, so measuring elapsed time and
 * rounding would call it "Today" and disagree with the server's overdue bucket.
 */
export function dueLabel(dueDate) {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Math.round((due - start) / 86400000);

  if (days < 0) return { text: days === -1 ? 'Yesterday' : `${Math.abs(days)} days overdue`, tone: 'text-danger-400' };
  if (days === 0) return { text: 'Today', tone: 'text-warn-400' };
  if (days === 1) return { text: 'Tomorrow', tone: 'text-steel-300' };
  return { text: formatDate(dueDate), tone: 'text-steel-400' };
}

/**
 * One task.
 *
 * `readOnly` is marketing's window on a buyer's work [§29]: they may see every task standing
 * between their customer and a delivery, and they may not tick off production's job. The
 * checkbox and the bin go; escalating stays, because "this needs doing" is exactly what a
 * marketing person rings about and the one thing they can usefully do from here.
 */
export function TodoRow({ todo, onToggle, onDelete, onClaim, onEscalate, readOnly = false, showDepartment = false }) {
  const due = dueLabel(todo.dueDate);

  return (
    <li className="group flex items-start gap-2.5 py-2">
      {readOnly ? (
        /* A spacer, so the rows in a mixed list still line up down the left edge. */
        <span aria-hidden className="mt-0.5 h-[1.05rem] w-[1.05rem] shrink-0" />
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={todo.completed}
          aria-label={todo.completed ? `Reopen ${todo.title}` : `Complete ${todo.title}`}
          onClick={() => onToggle(todo)}
          className={`mt-0.5 grid h-[1.05rem] w-[1.05rem] shrink-0 place-items-center rounded-[5px] border transition-colors ${
            todo.completed
              ? 'border-success-500 bg-success-500 text-white'
              : 'border-line/25 hover:border-flame-500'
          }`}
        >
          {todo.completed && <DockIcon name="check" className="h-3 w-3" />}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`text-xs leading-snug ${
            todo.completed ? 'text-steel-500 line-through' : 'font-medium text-steel-100'
          }`}
        >
          {/* A task raised by a handover points at the record that raised it, so acting on
              it is one click rather than a search. */}
          {todo.link && !todo.completed ? (
            <Link to={todo.link} className="transition-colors hover:text-accent">
              {todo.title}
            </Link>
          ) : (
            todo.title
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
          {due && !todo.completed && <span className={due.tone}>{due.text}</span>}
          {todo.priority !== 'normal' && !todo.completed && (
            <span className={PRIORITY_TONE[todo.priority]}>
              {todo.priority === 'high' ? 'High priority' : 'Low'}
            </span>
          )}
          {todo.notes && <span className="truncate text-steel-500">{todo.notes}</span>}
        </div>

        <TaskMeta task={todo} showDepartment={showDepartment} />

        {/*
          The two things you can do with somebody else's row. Always visible rather than
          revealed on hover: there is no hover on the tablet in the packing hall.

          **Taking a job is only offered on your own department's queue.** Marketing's window
          shows tasks production and despatch are holding, and offering "I'll take it" there was
          a button that ends in the server refusing — a promise the software cannot keep, and the
          exact thing the read-only rule exists to avoid. Handing it on is the one thing that
          does work from the window, which is also what a marketing person actually wants: not
          to do despatch's job, but to say it needs doing.
        */}
        {!todo.completed && (onClaim || onEscalate) && (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {onClaim && !readOnly && !todo.user && (
              <button type="button" className="row-action" onClick={() => onClaim(todo, true)}>
                I&rsquo;ll take it
              </button>
            )}
            {onClaim && !readOnly && todo.user && (
              <button type="button" className="row-action" onClick={() => onClaim(todo, false)}>
                Put it back
              </button>
            )}
            {onEscalate && (
              <button type="button" className="row-action" onClick={() => onEscalate(todo)}>
                Hand it on
              </button>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <button
          type="button"
          aria-label={`Delete ${todo.title}`}
          onClick={() => onDelete(todo)}
          className="mt-0.5 rounded p-1 text-steel-500 opacity-0 transition-opacity hover:text-danger-400 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <DockIcon name="trash" className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * Which list is being read [§29, §35].
 *
 * `mine` is the default, and that is the point of having tabs at all: the dock is the list
 * somebody works from, and a queue shared with four colleagues is not that. The other two are
 * asked for.
 */
export function ScopeTabs({ scope, setScope, meta, className = '' }) {
  const tabs = [
    { key: 'mine', label: 'Mine' },
    { key: 'department', label: meta?.department ? departmentLabel(meta.department) : 'My department' },
    ...(meta?.mayReadCustomers ? [{ key: 'customers', label: 'My customers' }] : []),
  ];

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setScope(tab.key)}
          className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
            scope === tab.key ? 'text-flame-400' : 'text-steel-400 hover:text-steel-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function TodoPanel() {
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
  const visible = showDone ? done : open;

  /* Marketing's window on a buyer's work is read-only [§29] — see `TodoRow`. */
  const readOnly = scope === 'customers';

  /* Each list is empty for a different reason, and "No open tasks" on the customers tab reads
     as though the buyer has nothing outstanding rather than as though nothing is stuck. */
  const emptyLine = showDone
    ? 'Nothing completed yet.'
    : {
        mine: 'No open tasks. Nice.',
        department: 'Nothing on the queue. The whole department is clear.',
        customers: 'Nothing outstanding on your customers, in any department.',
      }[scope];

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await addTodo({
        title: title.trim(),
        dueDate: dueDate || undefined,
        priority,
      });
      setTitle('');
      setDueDate('');
      setPriority('normal');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Not on the customers tab: a task typed there would land on marketing's own queue,
          which is not what a window on somebody else's work is for. */}
      {readOnly ? (
        <p className="border-b border-line/[0.06] px-4 py-3 text-xs leading-relaxed text-steel-400">
          Every task on the buyers you own, whichever department holds it. Read-only — hand one
          on if it needs doing sooner.
        </p>
      ) : (
      <form onSubmit={submit} className="border-b border-line/[0.06] px-4 py-3">
        <input
          className="input py-1.5 text-xs"
          placeholder="Add a task…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <input
            type="date"
            aria-label="Due date"
            className="input flex-1 py-1 text-xs"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <select
            aria-label="Priority"
            className="input w-24 py-1 text-xs"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <button type="submit" className="btn-primary px-3 py-1 text-xs" disabled={busy || !title.trim()}>
            Add
          </button>
        </div>
        {error && (
          <div className="mt-2">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
      </form>
      )}

      {/* Whose list, then which half of it. Two rows rather than one because they are different
          questions and a single row of five buttons reads as one set of choices. */}
      <ScopeTabs
        scope={scope}
        setScope={setScope}
        meta={todoMeta}
        className="border-b border-line/[0.06] px-4 py-2"
      />

      <div className="flex items-center gap-1 border-b border-line/[0.06] px-4 py-2">
        <button
          type="button"
          onClick={() => setShowDone(false)}
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            !showDone ? 'text-flame-400' : 'text-steel-400 hover:text-steel-200'
          }`}
        >
          Open ({open.length})
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

      <div className="flex-1 overflow-y-auto px-4">
        {visible.length ? (
          <ul className="divide-y divide-line/[0.04]">
            {visible.map((todo) => (
              <TodoRow
                key={todo._id}
                todo={todo}
                readOnly={readOnly}
                showDepartment={scope !== 'department'}
                onToggle={(item) => saveTodo({ id: item._id, completed: !item.completed })}
                onDelete={(item) => removeTodo(item._id)}
                onClaim={(item, take) => saveTodo({ id: item._id, claim: take })}
                onEscalate={setEscalating}
              />
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-xs text-steel-500">{emptyLine}</p>
        )}
      </div>

      <EscalateTaskDialog
        task={escalating}
        open={Boolean(escalating)}
        onClose={() => setEscalating(null)}
        onEscalated={escalateTodo}
      />
    </div>
  );
}
