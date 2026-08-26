import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../components/dock/WorkspaceContext.jsx';
import { Badge, PageHeader, Spinner } from '../components/ui.jsx';
import { formatDate, humanise } from '../utils/format.js';

/**
 * A headline figure. `tone` carries the blueprint's colour code: red is delayed or
 * overdue, amber needs action today, green is on track, slate is nothing to do.
 */
function StatTile({ label, value, sublabel, tone = 'neutral', to }) {
  const tones = {
    neutral: 'text-steel-50',
    good: 'text-success-400',
    warn: 'text-warn-400',
    bad: 'text-danger-400',
  };

  const body = (
    <div className={`h-full p-5 ${to ? 'card-interactive' : 'card'}`}>
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-3 ${tones[tone]}`}>{value}</p>
      {sublabel && <p className="mt-2 text-xs text-steel-400">{sublabel}</p>}
    </div>
  );

  return to ? (
    <Link to={to} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-bold tracking-tight text-steel-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-steel-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One bucket of the daily reminder, ticked off in place. */
function ReminderGroup({ title, tone, items, onComplete }) {
  if (!items?.length) return null;

  return (
    <div>
      <p className={`eyebrow mb-2 ${tone}`}>
        {title} · {items.length}
      </p>
      <ul className="space-y-2">
        {items.map((todo) => (
          <li key={todo._id} className="flex items-start gap-2.5">
            <button
              type="button"
              aria-label={`Complete ${todo.title}`}
              onClick={() => onComplete(todo)}
              className="mt-0.5 grid h-[1.05rem] w-[1.05rem] shrink-0 place-items-center rounded-[5px] border border-line/25 transition-colors hover:border-flame-500"
            />
            <div className="min-w-0">
              <p className="text-[0.8125rem] leading-snug text-steel-100">{todo.title}</p>
              {todo.notes && (
                <p className="mt-0.5 truncate text-xs text-steel-500">{todo.notes}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Which department dashboards arrive with which module. Driven off the user's own access,
 * so this reads as a roadmap of *their* screens rather than a generic feature list.
 */
function UpcomingDashboards({ modules }) {
  const pending = modules.filter((module) => module.canRead && !module.available);

  if (!pending.length) return null;

  return (
    <Panel
      title="Dashboards still to come"
      subtitle="Each module brings its own metrics when it ships"
    >
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {pending.map((module) => (
          <li key={module.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-steel-200">{module.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-steel-500">
                {module.description}
              </p>
            </div>
            <span className="shrink-0 text-[0.6875rem] font-semibold text-steel-500">
              {module.stage ? `Stage ${module.stage}` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { loading, reminders, todos, announcements, announcementMeta, saveTodo } = useWorkspace();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (loading && !reminders) return <Spinner label="Loading your day" />;

  const counts = reminders?.counts || { overdue: 0, today: 0, tomorrow: 0, actionable: 0 };
  const openTasks = todos.filter((todo) => !todo.completed).length;
  const nothingDue = counts.actionable === 0 && counts.tomorrow === 0;
  const recent = announcements.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle={new Date().toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        actions={
          <span className="hidden items-center gap-2 rounded-lg border border-line/[0.06] bg-line/[0.03] px-3 py-1.5 text-xs font-semibold text-steel-400 sm:inline-flex">
            {humanise(user?.department)}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Overdue"
          value={counts.overdue}
          sublabel={counts.overdue ? 'Past their date' : 'Nothing past its date'}
          tone={counts.overdue ? 'bad' : 'good'}
        />
        <StatTile
          label="Due today"
          value={counts.today}
          sublabel={counts.today ? 'Needs you today' : 'Clear for today'}
          tone={counts.today ? 'warn' : 'good'}
        />
        <StatTile
          label="Due tomorrow"
          value={counts.tomorrow}
          sublabel="Coming up next"
        />
        <StatTile
          label="Open tasks"
          value={openTasks}
          sublabel={`${announcementMeta.unread} unread announcement${
            announcementMeta.unread === 1 ? '' : 's'
          }`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Action required today"
          subtitle={
            counts.actionable
              ? `${counts.actionable} task${counts.actionable === 1 ? '' : 's'} need you`
              : 'Your day is clear'
          }
          className="lg:col-span-2"
        >
          {nothingDue ? (
            <p className="py-8 text-center text-sm text-steel-400">
              Nothing overdue or due today. Anything without a date sits in your to-do list.
            </p>
          ) : (
            <div className="space-y-5">
              <ReminderGroup
                title="Overdue"
                tone="text-danger-400"
                items={reminders?.overdue}
                onComplete={(todo) => saveTodo({ id: todo._id, completed: true })}
              />
              <ReminderGroup
                title="Today"
                tone="text-warn-400"
                items={reminders?.today}
                onComplete={(todo) => saveTodo({ id: todo._id, completed: true })}
              />
              <ReminderGroup
                title="Tomorrow"
                tone="text-steel-400"
                items={reminders?.tomorrow}
                onComplete={(todo) => saveTodo({ id: todo._id, completed: true })}
              />
            </div>
          )}
        </Panel>

        <Panel
          title="Announcements"
          action={
            announcementMeta.unread > 0 ? (
              <Badge tone="accent">{announcementMeta.unread} new</Badge>
            ) : null
          }
        >
          {recent.length ? (
            <ul className="space-y-3.5">
              {recent.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.read ? 'bg-transparent' : 'bg-flame-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-[0.8125rem] leading-snug ${
                        item.read ? 'text-steel-300' : 'font-semibold text-steel-100'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                      {humanise(item.category)} · {formatDate(item.publishedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-steel-400">No announcements right now.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <UpcomingDashboards modules={user?.modules || []} />
      </div>
    </div>
  );
}
