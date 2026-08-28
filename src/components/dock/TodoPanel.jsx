import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from './WorkspaceContext.jsx';
import DockIcon from './DockIcon.jsx';
import { Notice } from '../ui.jsx';
import { formatDate } from '../../utils/format.js';

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

export function TodoRow({ todo, onToggle, onDelete }) {
  const due = dueLabel(todo.dueDate);

  return (
    <li className="group flex items-start gap-2.5 py-2">
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

      <div className="min-w-0 flex-1">
        <p
          className={`text-[0.8125rem] leading-snug ${
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
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.6875rem]">
          {due && !todo.completed && <span className={due.tone}>{due.text}</span>}
          {todo.priority !== 'normal' && !todo.completed && (
            <span className={PRIORITY_TONE[todo.priority]}>
              {todo.priority === 'high' ? 'High priority' : 'Low'}
            </span>
          )}
          {todo.notes && <span className="truncate text-steel-500">{todo.notes}</span>}
        </div>
      </div>

      <button
        type="button"
        aria-label={`Delete ${todo.title}`}
        onClick={() => onDelete(todo)}
        className="mt-0.5 rounded p-1 text-steel-500 opacity-0 transition-opacity hover:text-danger-400 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <DockIcon name="trash" className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function TodoPanel() {
  const { todos, addTodo, saveTodo, removeTodo } = useWorkspace();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const open = todos.filter((todo) => !todo.completed);
  const done = todos.filter((todo) => todo.completed);
  const visible = showDone ? done : open;

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
      <form onSubmit={submit} className="border-b border-line/[0.06] px-4 py-3">
        <input
          className="input py-1.5 text-[0.8125rem]"
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
                onToggle={(item) => saveTodo({ id: item._id, completed: !item.completed })}
                onDelete={(item) => removeTodo(item._id)}
              />
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-[0.8125rem] text-steel-500">
            {showDone ? 'Nothing completed yet.' : 'No open tasks. Nice.'}
          </p>
        )}
      </div>
    </div>
  );
}
