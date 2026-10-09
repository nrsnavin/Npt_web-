import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { departments as departmentsApi, quotations as quotationsApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import HandoffTaskList from '../components/HandoffTaskList.jsx';
import HandoffTaskActions from '../components/HandoffTaskActions.jsx';
import { WorkspaceBrief, WorkspaceLinks } from '../components/DepartmentWorkspace.jsx';
import { DashboardSkeleton, ErrorState, PageHeader } from '../components/ui.jsx';
import { deskActionsFor } from '../config/deskActions.js';
import { formatDate } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';

/**
 * A department's desk [server: handoff.service `enquiriesHeldBy`, `departmentDashboard`].
 *
 * Leads with the enquiries the department holds right now, each a card with what it is, how
 * long it has been here, and the buttons the department presses — its own (from
 * `config/deskActions.js`, the list to edit) and the hand-over actions every department has:
 * Update, Move on, Send back, Change date. Late ones first.
 *
 * Beside them, in tabs: side requests sent to the department, what it is waiting on from others,
 * what came back, and what it finished this week.
 */

const DAY = 24 * 60 * 60 * 1000;
const daysSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY));

function Tile({ label, value, hint, tone = 'text-steel-50', active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-4 text-left transition hover:border-flame-500/40 ${active ? 'border-flame-500/60 ring-1 ring-flame-500/30' : ''}`}
    >
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-steel-400">{hint}</p>}
    </button>
  );
}

/** When it is due, as a coloured pill. */
function DuePill({ row }) {
  if (row.late) {
    return <span className="rounded-full bg-danger-500/15 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-danger-400">Late</span>;
  }
  if (row.dueToday) {
    return <span className="rounded-full bg-warn-500/15 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-warn-400">Due today</span>;
  }
  return <span className="rounded-full bg-line/[0.06] px-2.5 py-1 text-[0.7rem] font-semibold text-steel-400">Due {formatDate(row.task.dueDate)}</span>;
}

function Chip({ children }) {
  return <span className="rounded-md bg-line/[0.05] px-2 py-0.5 text-xs text-steel-300">{children}</span>;
}

/** One enquiry on the desk. */
function EnquiryCard({ row, department, me, onChanged }) {
  const { enquiry, task } = row;
  const holder = task.user?._id ? task.user : null;
  const lastUpdate = (task.updates || []).at(-1);
  const actions = deskActionsFor(department, row);
  const days = daysSince(row.since);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  /* An action that makes the work record, then opens it. */
  const raise = async (kind) => {
    if (kind !== 'quotation') return;
    setBusy(true);
    try {
      const made = await quotationsApi.create({ enquiry: enquiry._id });
      navigate(`/quotations/${made._id}`);
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    await workspace.todos.update({ id: task._id, claim: true });
    onChanged();
  };

  return (
    <article className={`card flex flex-col gap-3 p-4 transition hover:border-flame-500/30 ${row.late ? 'border-danger-500/30' : ''}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/enquiries/${enquiry._id}`} className="text-base font-bold text-steel-50 hover:text-accent">
            {enquiry.number}
          </Link>
          <p className="truncate text-sm text-steel-300">{enquiry.customer?.name || '—'}</p>
        </div>
        <DuePill row={row} />
      </header>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-flame-500/10 px-2 py-0.5 text-xs font-semibold text-flame-300">{enquiry.stageLabel}</span>
        {enquiry.requirement?.modelNumber && <Chip>{enquiry.requirement.modelNumber}</Chip>}
        {enquiry.items?.length > 1 && <Chip>+{enquiry.items.length - 1} more</Chip>}
        {enquiry.requirement?.colour && <Chip>{enquiry.requirement.colour}</Chip>}
        {row.records.quotation && <Chip>{row.records.quotation.number}</Chip>}
        {row.records.order && <Chip>{row.records.order.number}</Chip>}
      </div>

      {(lastUpdate || task.notes) && (
        <p className="line-clamp-2 text-sm text-steel-300">
          {lastUpdate ? (
            <>
              <span className="text-steel-500">{lastUpdate.by?.name || 'Update'}: </span>
              {lastUpdate.note}
            </>
          ) : (
            <>“{task.notes}”</>
          )}
        </p>
      )}

      <p className="text-xs text-steel-500">
        Here {days === 0 ? 'since today' : days === 1 ? '1 day' : `${days} days`}
        {' · '}
        {holder ? `with ${String(holder._id) === me ? 'you' : holder.name}` : 'nobody has picked it up'}
        {enquiry.assignedTo?.name && department !== 'marketing' ? ` · ${enquiry.assignedTo.name}’s buyer` : ''}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line/[0.06] pt-3">
        {actions.map((action) => (action.raise ? (
          <button
            key={action.label}
            type="button"
            disabled={busy}
            onClick={() => raise(action.raise)}
            className={`${action.primary ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
          >
            {busy ? 'Raising…' : action.label}
          </button>
        ) : (
          <Link
            key={action.label}
            to={action.href}
            className={`${action.primary ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
          >
            {action.label}
          </Link>
        )))}
        {!holder && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={claim}>
            I’ll take it
          </button>
        )}
      </div>
      <div className="-mt-1 flex flex-wrap gap-3">
        <HandoffTaskActions todo={task} onChanged={onChanged} />
      </div>
    </article>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'late', label: 'Late' },
  { key: 'today', label: 'Due today' },
  { key: 'unclaimed', label: 'Not picked up' },
  { key: 'mine', label: 'Mine' },
];

export default function DepartmentDashboard() {
  const { key = 'mine' } = useParams();
  const { user, departments, mayDelete } = useAuth();
  const fetch = useCallback(() => departmentsApi.dashboard(key), [key]);
  const { data, loading, error, reload } = useRecord(fetch, `department-${key}`);
  const [tab, setTab] = useState('enquiries');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const me = String(user?.id || user?._id || '');

  const enquiries = data?.enquiries || [];
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enquiries.filter((row) => {
      if (filter === 'late' && !row.late) return false;
      if (filter === 'today' && !row.dueToday) return false;
      if (filter === 'unclaimed' && row.task.user) return false;
      if (filter === 'mine' && String(row.task.user?._id || '') !== me) return false;
      if (!term) return true;
      return [row.enquiry.number, row.enquiry.customer?.name, row.enquiry.requirement?.modelNumber]
        .filter(Boolean).some((text) => text.toLowerCase().includes(term));
    });
  }, [enquiries, filter, search, me]);

  if (loading && !data) return <DashboardSkeleton label="Loading the department" tiles={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { figures, requests = [], recentlyDone, waitingOnOthers, cameBack, atStages } = data;
  const seesAll = mayDelete;
  /* The person's other desks, when they work in more than one department. */
  const otherDesks = departments.filter((entry) => entry !== figures.department);
  const late = enquiries.filter((row) => row.late).length;
  const today = enquiries.filter((row) => row.dueToday).length;
  const unclaimed = enquiries.filter((row) => !row.task.user).length;

  const TABS = [
    { key: 'enquiries', label: 'With us', count: enquiries.length },
    { key: 'requests', label: 'Requests', count: requests.length },
    { key: 'waiting', label: 'Waiting on others', count: waitingOnOthers.length },
    { key: 'back', label: 'Came back', count: cameBack.length },
    { key: 'done', label: 'Done this week', count: recentlyDone.length },
  ];

  const pick = (next) => {
    setTab('enquiries');
    setFilter(next);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={figures.label}
        subtitle="The enquiries with your department now, and what to do with each"
        actions={
          <div className="flex flex-wrap gap-2">
            {otherDesks.map((entry) => (
              <Link key={entry} to={`/departments/${entry}`} className="btn-secondary">
                {departmentLabel(entry)} desk
              </Link>
            ))}
            <button type="button" className="btn-secondary" onClick={reload}>Refresh</button>
            {seesAll && <Link to="/departments" className="btn-secondary">All departments</Link>}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="With us" value={enquiries.length} hint={`${figures.open} open tasks in all`} active={tab === 'enquiries' && filter === 'all'} onClick={() => pick('all')} />
        <Tile label="Late" value={late} tone={late ? 'text-danger-400' : 'text-success-400'} hint="Past the day they were due" active={filter === 'late'} onClick={() => pick('late')} />
        <Tile label="Due today" value={today} tone={today ? 'text-warn-400' : 'text-steel-50'} hint="By the end of today" active={filter === 'today'} onClick={() => pick('today')} />
        <Tile
          label="Not picked up"
          value={unclaimed}
          tone={unclaimed ? 'text-warn-400' : 'text-steel-50'}
          hint={figures.onTimePercent !== null ? `${figures.doneThisWeek} done this week · ${figures.onTimePercent}% on time` : `${figures.doneThisWeek} done this week`}
          active={filter === 'unclaimed'}
          onClick={() => pick('unclaimed')}
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-line/[0.06] bg-line/[0.02] p-1" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => setTab(entry.key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              tab === entry.key ? 'bg-flame-500 text-white shadow' : 'text-steel-300 hover:bg-line/[0.06]'
            }`}
          >
            {entry.label}
            <span className={`ml-2 rounded-full px-1.5 text-xs tabular-nums ${tab === entry.key ? 'bg-white/20' : 'bg-line/[0.08] text-steel-400'}`}>{entry.count}</span>
          </button>
        ))}
      </div>

      {tab === 'enquiries' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filter === entry.key ? 'border-flame-500 bg-flame-500/10 text-flame-300' : 'border-line/[0.1] text-steel-400 hover:text-steel-200'
                }`}
              >
                {entry.label}
              </button>
            ))}
            <input
              type="search"
              className="input ml-auto w-full sm:w-64"
              placeholder="Search enquiry, buyer or model…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {shown.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((row) => (
                <EnquiryCard key={row.task._id} row={row} department={figures.department} me={me} onChanged={reload} />
              ))}
            </div>
          ) : (
            <div className="card px-6 py-10 text-center">
              <p className="text-base font-semibold text-steel-200">
                {enquiries.length ? 'Nothing matches this filter.' : 'No enquiry is with your department right now.'}
              </p>
              <p className="mt-1 text-sm text-steel-500">
                {enquiries.length ? 'Pick another, or clear the search.' : 'When another department sends one here, it appears on this desk.'}
              </p>
            </div>
          )}
        </section>
      )}

      {tab === 'requests' && (
        <section className="card p-5">
          <HandoffTaskList tasks={requests} onChanged={reload} empty="No side requests — only the enquiries themselves." />
        </section>
      )}
      {tab === 'waiting' && (
        <section className="card p-5">
          <HandoffTaskList tasks={waitingOnOthers} perspective="sender" onChanged={reload} empty="Nothing sent out is still open." />
        </section>
      )}
      {tab === 'back' && (
        <section className="card p-5">
          <HandoffTaskList tasks={cameBack} perspective="sender" empty="Nothing came back this week." />
        </section>
      )}
      {tab === 'done' && (
        <section className="card p-5">
          <HandoffTaskList tasks={recentlyDone} empty="Nothing finished this week yet." />
        </section>
      )}

      <WorkspaceLinks department={figures.department} label={figures.label} atStages={atStages} />
      <WorkspaceBrief department={figures.department} label={figures.label} />
    </div>
  );
}
