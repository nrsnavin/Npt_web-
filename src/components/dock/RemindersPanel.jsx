import { useWorkspace } from './WorkspaceContext.jsx';
import DockIcon from './DockIcon.jsx';

function Group({ title, tone, items, onComplete }) {
  if (!items?.length) return null;

  return (
    <div className="px-4 py-3">
      <p className={`eyebrow mb-2 ${tone}`}>
        {title} · {items.length}
      </p>
      <ul className="space-y-1.5">
        {items.map((todo) => (
          <li key={todo._id} className="flex items-start gap-2.5">
            <button
              type="button"
              aria-label={`Complete ${todo.title}`}
              onClick={() => onComplete(todo)}
              className="mt-0.5 grid h-[1.05rem] w-[1.05rem] shrink-0 place-items-center rounded-[5px] border border-line/25 transition-colors hover:border-flame-500"
            />
            <span className="text-[0.8125rem] leading-snug text-steel-100">{todo.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The day's reminder. Deliberately read-only apart from ticking things off — it answers
 * "what needs me today", and editing belongs in the task list.
 */
export default function RemindersPanel() {
  const { reminders, saveTodo } = useWorkspace();

  const complete = (todo) => saveTodo({ id: todo._id, completed: true });
  const nothing =
    reminders &&
    !reminders.overdue.length &&
    !reminders.today.length &&
    !reminders.tomorrow.length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-line/[0.06] px-4 py-3">
        <p className="text-[0.8125rem] text-steel-300">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <p className="mt-0.5 text-xs text-steel-500">
          {reminders?.counts.actionable
            ? `${reminders.counts.actionable} task${reminders.counts.actionable === 1 ? '' : 's'} need you today`
            : 'Nothing needs you today'}
        </p>
      </div>

      {nothing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <DockIcon name="check" className="h-6 w-6 text-success-400" />
          <p className="text-[0.8125rem] text-steel-400">
            Nothing overdue or due today. Anything without a date sits in your task list.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line/[0.04]">
          <Group title="Overdue" tone="text-danger-400" items={reminders?.overdue} onComplete={complete} />
          <Group title="Today" tone="text-warn-400" items={reminders?.today} onComplete={complete} />
          <Group title="Tomorrow" tone="text-steel-400" items={reminders?.tomorrow} onComplete={complete} />
        </div>
      )}
    </div>
  );
}
