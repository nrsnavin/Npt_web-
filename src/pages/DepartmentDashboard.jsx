import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { departments as departmentsApi, quotations as quotationsApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import HandoffTaskList from '../components/HandoffTaskList.jsx';
import HandoffTaskActions from '../components/HandoffTaskActions.jsx';
import { TaskFacts } from '../components/TaskHistory.jsx';
import TaskPdfLink from '../components/TaskPdfLink.jsx';
import TaskWorkflow from '../components/TaskWorkflow.jsx';
import TaskEdd from '../components/TaskEdd.jsx';
import AttentionPanel from '../components/AttentionPanel.jsx';
import DepartmentTaskDialog from '../components/DepartmentTaskDialog.jsx';
import TripPlanner from '../components/TripPlanner.jsx';
import DeliveryQueue from '../components/DeliveryQueue.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import SamplingWorkQueue from '../components/SamplingWorkQueue.jsx';
import Enquiries from './Enquiries.jsx';
import OverviewDashboard from './OverviewDashboard.jsx';
import { firstDashboardTab } from '../config/simpleNav.js';
import { WorkspaceBrief, WorkspaceLinks } from '../components/DepartmentWorkspace.jsx';
import { DashboardSkeleton, ErrorState, PageHeader } from '../components/ui.jsx';
import { deskActionsFor } from '../config/deskActions.js';
import { formatDate } from '../utils/format.js';
import { departmentLabel, deskOf } from '../utils/pipeline.js';
import DeskTabs, { firstDeskTab } from '../components/DeskTabs.jsx';
import ProductionQueueList from '../components/ProductionQueueList.jsx';
import SoDesk from '../components/SoDesk.jsx';
import FinishingDeskList from '../components/FinishingDeskList.jsx';
import FinishingQueueList, { TEAM_WORDS } from '../components/FinishingQueueList.jsx';
import { EDD_CHIP, eddChipOf } from '../utils/edd.js';
import { EDD_BANDS, PRODUCTION_FILTERS, eddBandOf, eddBands } from '../utils/productionQueue.js';

/**
 * A department's dashboard [server: handoff.service `enquiriesHeldBy`, `departmentDashboard`].
 *
 * Leads with the department tasks open on its queue — raised by clicking the department on an
 * enquiry — each a card with the enquiry, what was asked, how long it has been here, and the
 * buttons the department presses: its own (from `config/deskActions.js`, the list to edit) and
 * the task actions every department has: Update, Done, Send back, Change date. Late ones first.
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
    return <span className="rounded-full bg-danger-500/15 px-2.5 py-1 text-[0.75rem] font-bold uppercase tracking-wide text-danger-400">Late</span>;
  }
  if (row.dueToday) {
    return <span className="rounded-full bg-warn-500/15 px-2.5 py-1 text-[0.75rem] font-bold uppercase tracking-wide text-warn-400">Due today</span>;
  }
  return <span className="rounded-full bg-line/[0.06] px-2.5 py-1 text-[0.75rem] font-semibold text-steel-400">Due {formatDate(row.task.dueDate)}</span>;
}

function Chip({ children }) {
  return <span className="rounded-md bg-line/[0.05] px-2 py-0.5 text-xs text-steel-300">{children}</span>;
}

/** One enquiry on the desk. */
function EnquiryCard({ row, department, me, onChanged }) {
  const { enquiry, task } = row;
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, task.kind);
  const holder = task.user?._id ? task.user : null;
  const lastUpdate = (task.updates || []).at(-1);
  /* A team task raised without an enquiry has no enquiry screens to open. */
  const actions = enquiry ? deskActionsFor(department, row) : [];
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
          {enquiry ? (
            <Link to={`/enquiries/${enquiry._id}`} className="text-base font-bold text-steel-50 hover:text-accent">
              {enquiry.number}
            </Link>
          ) : (
            <p className="text-base font-bold text-steel-50">Team task</p>
          )}
          <p className="truncate text-sm text-steel-300">{(enquiry ? enquiry.customer?.name : task.customer?.name) || (enquiry ? '—' : 'No enquiry')}</p>
        </div>
        <DuePill row={row} />
      </header>

      <p className="text-sm font-semibold text-steel-100">{button?.label || task.title}</p>
      {/* What was asked, as it was entered on the form — every answer, each model in its own block. */}
      <TaskFacts button={button} task={task} className="-mt-1" />
      <TaskPdfLink file={task.attachment} className="-mt-2 self-start" />

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-flame-500/10 px-2 py-0.5 text-xs font-semibold text-flame-400">{enquiry ? enquiry.stageLabel : `From ${task.createdBy?.name || 'Admin'}`}</span>
        {enquiry?.requirement?.modelNumber && <Chip>{enquiry.requirement.modelNumber}</Chip>}
        {enquiry?.items?.length > 1 && <Chip>+{enquiry.items.length - 1} more</Chip>}
        {enquiry?.requirement?.colour && <Chip>{enquiry.requirement.colour}</Chip>}
        {/* The EDD, on the tasks that give it or work to it — or that it is still wanted. */}
        {eddChipOf(task) && <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${EDD_CHIP[eddChipOf(task).tone]}`}>{eddChipOf(task).label}</span>}
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
        {enquiry?.assignedTo?.name && department !== 'marketing' ? ` · ${enquiry.assignedTo.name}’s buyer` : ''}
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
      {/* The EDD: asked for on Production's, Assembly's and Printing's tasks until it is given; read on Dispatch's. */}
      <TaskEdd todo={task} mayAct onChanged={onChanged} />
      {/* The department's own workflow on the task, where it has one (the SO team's statuses). */}
      <TaskWorkflow todo={task} onChanged={onChanged} />
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

function DepartmentDesk() {
  const { key = 'mine' } = useParams();
  const { user, departments, mayDelete, canRead, isAdmin } = useAuth();
  const fetch = useCallback(() => departmentsApi.dashboard(key), [key]);
  const { data, loading, error, reload } = useRecord(fetch, `department-${key}`);
  const [chosenTab, setTab] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  /* "New team task": Admin and marketing ask a team for something with no enquiry behind it. */
  const [newTeamTask, setNewTeamTask] = useState(false);
  const catalogue = useHandoffCatalogue();
  const firstTask = (catalogue?.buttons || []).find((button) => button.department && !button.hidden && button.form)?.key;
  const me = String(user?.id || user?._id || '');

  /*
   * A shared desk (Quality · Printing · Assembling): one team at a time, as tabs across the top
   * [components/DeskTabs.jsx] — each team's tasks fill the screen instead of being stacked.
   */
  const [deskChoice, setDeskChoice] = useState(null);
  const deskList = data?.desk ? (deskOf(data.desk.departments[0])?.departments || data.desk.departments) : null;
  const deskTab = deskList ? (deskList.includes(deskChoice) ? deskChoice : firstDeskTab(deskList, departments)) : null;
  const everyRow = data?.enquiries || [];
  const enquiries = useMemo(() => (deskTab ? everyRow.filter((row) => row.task.department === deskTab) : everyRow), [everyRow, deskTab]);
  /*
   * Production's desk is its queue in EDD order — the goods due soonest first, the undated last —
   * rather than every enquiry in the plant [utils/productionQueue.js]. Its filters are the bands.
   */
  const isProduction = data?.figures?.department === 'production';
  /* The SO team's desk reads its requests ready-first, sized and with the buyer beside each [components/SoDesk.jsx]. */
  const isSoTeam = data?.figures?.department === 'order_confirmation';
  /* Printing's and Assembly's desks are their queues in EDD order, with where the goods are [components/FinishingQueueList.jsx]. */
  const queueTeam = deskTab && TEAM_WORDS[deskTab] ? deskTab : null;
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enquiries.filter((row) => {
      if (isProduction) {
        if (EDD_BANDS.some((band) => band.key === filter) && eddBandOf(row) !== filter) return false;
      } else {
        if (filter === 'late' && !row.late) return false;
        if (filter === 'today' && !row.dueToday) return false;
      }
      if (filter === 'unclaimed' && row.task.user) return false;
      if (filter === 'mine' && String(row.task.user?._id || '') !== me) return false;
      if (!term) return true;
      return [row.enquiry?.number, row.enquiry?.customer?.name || row.task.customer?.name, row.enquiry?.requirement?.modelNumber, row.task.title]
        .filter(Boolean).some((text) => text.toLowerCase().includes(term));
    });
  }, [enquiries, filter, search, me, isProduction]);

  if (loading && !data) return <DashboardSkeleton label="Loading the department" tiles={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { figures, requests: everyRequest = [], recentlyDone, waitingOnOthers, cameBack, atStages } = data;
  const requests = deskTab ? everyRequest.filter((task) => task.department === deskTab) : everyRequest;
  const deskCounts = deskList ? Object.fromEntries(deskList.map((key) => [key, everyRow.filter((row) => row.task.department === key).length])) : {};
  /* Sampling works from its own queue — the sample requests, as the team designed it. */
  const isSampling = figures.department === 'sampling';
  /* Every enquiry this person may see — all of them for Admin, their own for marketing. Not on
     the Production desk: that is the queue, in EDD order, and nothing else. */
  const seesEnquiries = canRead('enquiries') && !isProduction;
  const everyone = isAdmin || figures.department === 'management';
  const tab = chosenTab || firstDashboardTab(figures.department, { isAdmin: everyone, seesEnquiries });
  const seesAll = mayDelete;
  /* A shared desk: the tab above has picked the team, so its rows are one list. */
  const deskMembers = deskList || [figures.department];
  const bySection = (rows) => [{ key: 'all', label: null, rows }];
  /* The person's other desks, when they work in more than one department. */
  const otherDesks = departments.filter((entry) => !deskMembers.includes(entry));
  const late = enquiries.filter((row) => (isProduction ? eddBandOf(row) === 'late' : row.late)).length;
  const today = enquiries.filter((row) => (isProduction ? eddBandOf(row) === 'today' : row.dueToday)).length;
  const unclaimed = enquiries.filter((row) => !row.task.user).length;
  const undated = enquiries.filter((row) => eddBandOf(row) === 'none').length;
  const filters = isProduction ? PRODUCTION_FILTERS : FILTERS;

  const TABS = [
    ...(isSampling ? [{ key: 'queue', label: 'Work queue', count: null }] : []),
    ...(seesEnquiries
      ? [{ key: 'all', label: everyone ? 'All enquiries' : figures.department === 'marketing' ? 'My enquiries' : 'All enquiries', count: null }]
      : []),
    { key: 'enquiries', label: isProduction ? 'Production queue' : queueTeam ? TEAM_WORDS[queueTeam].queue : 'Department tasks', count: enquiries.length },
    /* Dispatch's delivery queue: every open request by the urgency marketing gave [DeliveryQueue]. */
    ...(data.baskets ? [{ key: 'delivery', label: 'Delivery queue', count: null }] : []),
    /* Dispatch plans its trips here: ready requests grouped by transporter, route and place [TripPlanner]. */
    ...(data.baskets ? [{ key: 'baskets', label: 'Plan trips', count: null }] : []),
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
        title={`${figures.label} dashboard`}
        subtitle={isProduction ? 'The queue in EDD order — open an enquiry’s workflow to give its statuses, hand-overs and EDD'
          : queueTeam ? `${TEAM_WORDS[queueTeam].queue} in EDD order — what is in hand to ${TEAM_WORDS[queueTeam].verb}, and what is still with ${TEAM_WORDS[queueTeam].from}` : seesEnquiries ? 'Your department’s tasks, and every enquiry you can see' : 'The tasks raised for your department'}
        actions={
          <div className="flex flex-wrap gap-2">
            {otherDesks.map((entry) => (
              <Link key={entry} to={`/departments/${entry}`} className="btn-secondary">
                {departmentLabel(entry)} desk
              </Link>
            ))}
            {isProduction && <Link to="/work-orders" className="btn-secondary">Work orders</Link>}
            {(isAdmin || departments?.includes('marketing')) && firstTask && (
              <button type="button" className="btn-primary" onClick={() => setNewTeamTask(true)}>New team task</button>
            )}
            <button type="button" className="btn-secondary" onClick={reload}>Refresh</button>
            {seesAll && <Link to="/departments" className="btn-secondary">All departments</Link>}
          </div>
        }
      />

      {newTeamTask && (
        <DepartmentTaskDialog enquiry={null} catalogue={catalogue} kind={firstTask} onClose={() => setNewTeamTask(false)} onSent={reload} />
      )}

      {/* Quality · Printing · Assembling: one team on screen at a time. */}
      {deskList && <DeskTabs departments={deskList} counts={deskCounts} value={deskTab} onChange={setDeskChoice} />}

      {/* Questions for this person and answers back to the department — acted on here, on every tab. */}
      <AttentionPanel attention={data.attention} onChanged={reload} />

      {tab === 'enquiries' && !isProduction && !queueTeam && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Open tasks" value={enquiries.length} hint={`${figures.open} on the department in all`} active={tab === 'enquiries' && filter === 'all'} onClick={() => pick('all')} />
        <Tile label="Late" value={late} tone={late ? 'text-danger-400' : 'text-success-400'} hint={isProduction ? 'Past the EDD' : 'Past the day they were due'} active={filter === 'late'} onClick={() => pick('late')} />
        <Tile label="Due today" value={today} tone={today ? 'text-warn-400' : 'text-steel-50'} hint={isProduction ? 'EDD is today' : 'By the end of today'} active={filter === 'today'} onClick={() => pick('today')} />
        {isProduction ? (
          <Tile label="No EDD yet" value={undated} tone={undated ? 'text-warn-400' : 'text-success-400'} hint="Give the date on the task" active={filter === 'none'} onClick={() => pick('none')} />
        ) : (
          <Tile
            label="Not picked up"
            value={unclaimed}
            tone={unclaimed ? 'text-warn-400' : 'text-steel-50'}
            hint={figures.onTimePercent !== null ? `${figures.doneThisWeek} done this week · ${figures.onTimePercent}% on time` : `${figures.doneThisWeek} done this week`}
            active={filter === 'unclaimed'}
            onClick={() => pick('unclaimed')}
          />
        )}
      </div>}

      <div className="flex flex-wrap gap-1 rounded-xl border border-line/[0.06] bg-line/[0.02] p-1" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => setTab(entry.key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              tab === entry.key ? 'fill-primary shadow' : 'text-steel-300 hover:bg-line/[0.06]'
            }`}
          >
            {entry.label}
            {entry.count !== null && (
              <span className={`ml-2 rounded-full px-1.5 text-xs tabular-nums ${tab === entry.key ? 'bg-white/20' : 'bg-line/[0.08] text-steel-400'}`}>{entry.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'queue' && <SamplingWorkQueue />}

      {tab === 'all' && <Enquiries embedded />}

      {/* Production's queue: one line per enquiry in EDD order; each is worked on its workflow page. */}
      {tab === 'enquiries' && isProduction && <ProductionQueueList compact />}

      {tab === 'enquiries' && isSoTeam && <SoDesk me={me} onChanged={reload} />}

      {/* Printing's and Assembly's queues: the goods in hand to work, and what is still with the team before. */}
      {tab === 'enquiries' && queueTeam && <FinishingQueueList key={queueTeam} team={queueTeam} compact onChanged={reload} />}

      {tab === 'enquiries' && !isProduction && !isSoTeam && !queueTeam && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filter === entry.key ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-line/[0.1] text-steel-400 hover:text-steel-200'
                }`}
              >
                {entry.label}
              </button>
            ))}
            <input aria-label="Search enquiry, buyer or model"
              type="search"
              className="input ml-auto w-full sm:w-64"
              placeholder="Search enquiry, buyer or model…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {/* Quality · Printing · Assembly: one line a task — enquiry, buyer, EDD, the state in 20–30 words, the workflow page. */}
          {deskList && shown.length > 0 ? (
            <FinishingDeskList rows={shown} onChanged={reload} />
          ) : shown.length ? (
            (isProduction
              ? eddBands(shown).map((band) => ({ key: band.key, label: band.label, tone: band.tone, rows: band.rows }))
              : bySection(shown, (row) => row.task.department)
            ).map((section) => (
              <div key={section.key} className="space-y-3">
                {section.label && <h2 className={`text-sm font-bold uppercase tracking-wide ${section.tone || 'text-steel-300'}`}>{section.label} <span className="font-normal normal-case tabular-nums text-steel-500">{section.rows.length}</span></h2>}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.rows.map((row) => (
                    <EnquiryCard key={row.task._id} row={row} department={row.task.department || figures.department} me={me} onChanged={reload} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="card px-6 py-10 text-center">
              <p className="text-base font-semibold text-steel-200">
                {enquiries.length ? 'Nothing matches this filter.' : 'No department task open right now.'}
              </p>
              <p className="mt-1 text-sm text-steel-500">
                {enquiries.length ? 'Pick another, or clear the search.' : 'When someone clicks your department on an enquiry, its task appears here.'}
              </p>
            </div>
          )}
        </section>
      )}

      {tab === 'delivery' && (
        <section className="card space-y-3 p-5">
          <p className="text-sm text-steel-300">
            Every open request in the order it has to go: late first, then Top Most Urgent, Today Morning (by noon), Today Evening and Today (by 7 PM),
            Tomorrow — and last, those whose urgency marketing has not given yet. Nothing here holds a dispatch.
          </p>
          <DeliveryQueue />
        </section>
      )}

      {tab === 'baskets' && (
        <section className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-steel-300">Ready requests in groups that can go together — tick who goes and press Make trip.</p>
            <Link to="/dispatch/lists" className="text-xs font-semibold text-accent hover:underline">Vehicles &amp; transporters</Link>
          </div>
          <TripPlanner />
        </section>
      )}

      {tab === 'requests' && (
        <section className="card space-y-4 p-5">
          {requests.length ? bySection(requests, (task) => task.department).map((section) => (
            <div key={section.key}>
              {section.label && <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-steel-300">{section.label}</h2>}
              <HandoffTaskList tasks={section.rows} onChanged={reload} />
            </div>
          )) : <HandoffTaskList tasks={[]} onChanged={reload} empty="No side requests — only the enquiries themselves." />}
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

/**
 * `/departments/mine` is the Dashboard on the bar. For Admin and marketing it is the overview
 * [pages/OverviewDashboard.jsx] — figures, new enquiries, the department tasks they follow and
 * the party master; their department desks stay one link away (`/departments/<key>`). Every
 * other department opens on its own desk.
 */
export default function DepartmentDashboard() {
  const { key = 'mine' } = useParams();
  const { isManagement, departments = [] } = useAuth();
  if (key === 'mine' && (isManagement || departments.includes('marketing'))) return <OverviewDashboard />;
  return <DepartmentDesk />;
}
