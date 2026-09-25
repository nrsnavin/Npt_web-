import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { queries as queriesApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, DashboardSkeleton, ErrorState, PageHeader } from '../components/ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * Home for the departments the app reaches mostly through questions — despatch, accounts,
 * quality, production, order confirmation.
 *
 * My day counts follow-up tasks, which is how work reaches marketing and almost never how it
 * reaches a despatch desk: that desk's work in here is somebody asking it something. So this
 * leads with the questions waiting on the department, then the ones the person was tagged in,
 * then their own tasks — three short lists, each a click from the thing itself.
 */
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

function Tile({ label, value, to, tone = 'neutral' }) {
  const ring = tone === 'warn' ? 'ring-warn-500/30' : tone === 'info' ? 'ring-aqua-500/30' : 'ring-line/[0.06]';
  return (
    <Link to={to} className={`card block p-5 ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-modal ${ring}`}>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-steel-50">{value}</p>
    </Link>
  );
}

function QueryRows({ rows, empty }) {
  if (!rows.length) return <p className="px-5 py-6 text-sm text-steel-500">{empty}</p>;
  return (
    <ul className="divide-y divide-line/[0.05]">
      {rows.map((row) => (
        <li key={row._id}>
          <Link to={`/queries/${row._id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-line/[0.03]">
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${row.unread ? 'font-bold text-steel-50' : 'font-semibold text-steel-200'}`}>{row.subject}</p>
              <p className="truncate text-xs text-steel-500">
                {row.customer?.name || 'No customer'} · {row.raisedBy?.name || 'somebody'} · {formatDate(row.createdAt)}
              </p>
            </div>
            {row.isUrgent && <Badge tone="danger">Urgent</Badge>}
            {row.unread > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-flame-500 px-1.5 text-[0.7rem] font-bold text-white">
                {row.unread}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, action, children, id }) {
  return (
    <section id={id} className="card scroll-mt-20 overflow-hidden">
      <header className="flex items-center justify-between border-b border-line/[0.06] px-5 py-3.5">
        <h2 className="text-sm font-bold tracking-tight text-steel-50">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function TeamHome() {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const department = user?.department;
  const team = departmentLabel(department);

  const load = () => {
    setError(null);
    Promise.all([
      queriesApi.list({ department, status: 'open', limit: 6 }),
      queriesApi.list({ tagged: 'me', open: 'true', limit: 6 }),
      workspace.todos.list({ status: 'open', limit: 6 }),
    ])
      .then(([waiting, tagged, todos]) => setState({ waiting, tagged, todos }))
      .catch(setError);
  };

  useEffect(load, [department]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!state) return <DashboardSkeleton label="Loading your day" tiles={3} />;

  const { waiting, tagged, todos } = state;
  const tasks = todos.data || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={`${team} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <Link to="/queries?new=1" className="btn-primary">
            + Ask a question
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label={`Waiting on ${team}`} value={waiting.pagination?.total ?? waiting.data.length} to={`/queries?department=${department}&status=open`} tone="warn" />
        <Tile label="You were tagged" value={tagged.pagination?.total ?? tagged.data.length} to="/queries?tagged=me" tone="info" />
        <Tile label="Your open tasks" value={todos.pagination?.total ?? tasks.length} to="#your-tasks" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={`Questions waiting on ${team}`}
          action={<Link to={`/queries?department=${department}&status=open`} className="text-xs font-semibold text-accent hover:underline">All of them →</Link>}
        >
          <QueryRows rows={waiting.data} empty={`Nobody is waiting on ${team}. Nice.`} />
        </Panel>

        <Panel
          title="Where you were tagged"
          action={<Link to="/queries?tagged=me" className="text-xs font-semibold text-accent hover:underline">All of them →</Link>}
        >
          <QueryRows rows={tagged.data} empty="Nobody has tagged you in a live thread." />
        </Panel>
      </div>

      <Panel id="your-tasks" title="Your tasks">
        {tasks.length ? (
          <ul className="divide-y divide-line/[0.05]">
            {tasks.map((task) => (
              <li key={task._id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-steel-200">{task.title}</span>
                {task.dueDate && <span className="shrink-0 text-xs text-steel-500">{formatDate(task.dueDate)}</span>}
                {task.link && (
                  <Link to={task.link} className="shrink-0 text-xs font-semibold text-accent hover:underline">Open</Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-steel-500">No open tasks. The To-do rail on the right is where they arrive.</p>
        )}
      </Panel>
    </div>
  );
}
