import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { departments as departmentsApi, quotations as quotationsApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import HandoffTaskList from '../components/HandoffTaskList.jsx';
import HandoffTaskActions from '../components/HandoffTaskActions.jsx';
import { TaskFacts } from '../components/TaskHistory.jsx';
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
import { DeliveryBadge, DeliveryRiskPanel, inDanger } from '../components/DeliveryRisk.jsx';
import DispatchTable from '../components/DispatchTable.jsx';
import DeskTables, { DESK_TABLE_KINDS, takesTable } from '../components/DeskTables.jsx';
import PaymentsToConfirm from '../components/PaymentsToConfirm.jsx';
import { DispatchModelList } from '../components/DispatchModels.jsx';

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

/**
 * One part of the Tasks tab — To do, We asked, Replies — with its count, folded with a click.
 */
function TaskSection({ title, count, hint, tone = 'text-steel-100', children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="space-y-3" aria-label={title}>
      <button type="button" className="flex w-full flex-wrap items-baseline gap-x-2 border-b border-line/[0.08] pb-1.5 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="text-steel-500" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <h2 className={`text-base font-bold ${tone}`}>{title}</h2>
        <span className="rounded-full bg-line/[0.08] px-2 text-xs font-semibold tabular-nums text-steel-300">{count}</span>
        {hint && <span className="text-xs text-steel-500">{hint}</span>}
      </button>
      {open && children}
    </section>
  );
}

/** A group inside To do: other teams' questions, the department's other jobs. */
function TaskGroup({ title, count, hint, children }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-steel-300">
        {title}
        {count !== undefined && <span className="ml-2 font-normal normal-case tabular-nums text-steel-500">{count}</span>}
      </h3>
      {hint && <p className="-mt-1 text-xs text-steel-500">{hint}</p>}
      {children}
    </div>
  );
}

function Chip({ children }) {
  return <span className="rounded-md bg-line/[0.05] px-2 py-0.5 text-xs text-steel-300">{children}</span>;
}

/** One enquiry on the desk. */
function EnquiryCard({ row, department, me, onChanged, query = false }) {
  const { enquiry, task } = row;
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, task.kind);
  const holder = task.user?._id ? task.user : null;
  const lastUpdate = (task.updates || []).at(-1);
  /* A team task raised without an enquiry has no enquiry screens to open. */
  /* A team task has no enquiry screens — but a customer's Create Quotation task has the quotation it raised [server: raiseTeamTask]. */
  /* A readiness query is answered on its own short workflow below; the enquiry is there to read. */
  const actions = query
    ? (enquiry ? [{ label: 'Open enquiry', href: `/enquiries/${enquiry._id}` }] : [])
    : enquiry
    ? deskActionsFor(department, row)
    : row.records?.quotation ? [{ label: 'Cost the quotation', href: `/quotations/${row.records.quotation._id}`, primary: true }] : [];
  const days = daysSince(row.since);
  /* One main (orange) button on a card: the next step, when the task has steps — the links to other screens are then plain. */
  const hasSteps = !query && Boolean(button?.form?.statuses?.length);
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
        <div className="flex flex-col items-end gap-1">
          <DuePill row={row} />
          {/* In danger of missing marketing's EDD — sooner for an order of several models [server: deliveryRisk.service]. */}
          {inDanger(row.delivery) && <DeliveryBadge risk={row.delivery} />}
        </div>
      </header>

      <p className="text-sm font-semibold text-steel-100">
        {query ? `${departmentLabel(task.fromDepartment) || 'Another team'} asks — when will it be ready?` : button?.label || task.title}
      </p>
      {/* Several models on a Dispatch request: each its own state — in the plant, ready, part sent, fully sent [DispatchModelList]. */}
      {row.dispatchModels?.length > 1 && (
        <div className="-mt-1 rounded-lg bg-line/[0.04] px-2.5 py-1.5">
          <DispatchModelList models={row.dispatchModels} compact />
        </div>
      )}
      {/* An order going out model by model [server: handoff.controller `withReadiness`]: what may go now, what has gone, what is still being made. */}
      {row.readiness?.plan === 'by_model' && !(row.dispatchModels?.length > 1) && (
        <p className="-mt-1 rounded-lg bg-line/[0.04] px-2.5 py-1.5 text-xs text-steel-200" aria-label="Models to dispatch">
          <span className="font-semibold text-success-400">Ready to go: {row.readiness.ready.filter((model) => !(row.readiness.sent || []).includes(model)).join(', ') || 'none yet'}</span>
          {row.readiness.sent?.length > 0 && <span className="text-steel-400"> · Sent: {row.readiness.sent.join(', ')}</span>}
          {row.readiness.partSent?.length > 0 && <span className="text-steel-400"> · Part sent: {row.readiness.partSent.map((entry) => `${entry.model} (${entry.sent.toLocaleString('en-IN')}${entry.ordered ? ` of ${entry.ordered.toLocaleString('en-IN')}` : ''} pcs)`).join(', ')}</span>}
          {row.readiness.waiting?.length > 0 && <span className="text-warn-400"> · Still being made: {row.readiness.waiting.map((entry) => `${entry.model} (${entry.team === 'assembling' ? 'Assembly' : entry.team === 'printing' ? 'Printing' : 'Production'}${entry.status ? ` · ${entry.status}` : ''})`).join(', ')}</span>}
          <span className="block text-steel-500">Dispatch plan: each model as it is ready — dispatch each load with its models; the app marks it Part or Fully Dispatched.</span>
        </p>
      )}
      {/* What was asked, as it was entered on the form — every answer, each model in its own block. */}
      <TaskFacts button={button} task={task} className="-mt-1" />

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
        {holder ? `with ${String(holder._id) === me ? 'you' : holder.name}` : 'not assigned yet'}
        {enquiry?.assignedTo?.name && department !== 'marketing' ? ` · ${enquiry.assignedTo.name}’s buyer` : ''}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line/[0.06] pt-3">
        {actions.map((action) => (action.raise ? (
          <button
            key={action.label}
            type="button"
            disabled={busy}
            onClick={() => raise(action.raise)}
            className={`${action.primary && !hasSteps ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
          >
            {busy ? 'Raising…' : action.label}
          </button>
        ) : (
          <Link
            key={action.label}
            to={action.href}
            className={`${action.primary && !hasSteps ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
          >
            {action.label}
          </Link>
        )))}
        {!holder && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={claim}>
            Take this job
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

/* Where a desk's Table / Cards choice is kept, on this device — Dispatch's under its first key. */
const viewKeyOf = (department) => (department === 'despatch' ? 'npt.dispatchView' : `npt.deskView.${department}`);
/* The desks that read as tables [DispatchTable, DeskTables]. */
const TABLE_DESKS = ['despatch', ...Object.keys(DESK_TABLE_KINDS)];
/* With no choice kept: a table on a desktop, cards on a phone — a table there scrolls sideways. */
const wideScreen = () => {
  try { return window.matchMedia('(min-width: 768px)').matches; } catch { return true; }
};
const readView = (department) => {
  let kept = null;
  try { kept = localStorage.getItem(viewKeyOf(department)); } catch { /* nothing kept */ }
  if (kept) return kept === 'cards' ? 'cards' : 'table';
  return wideScreen() ? 'table' : 'cards';
};
/* The desks that list enquiries — marketing's and Admin's; every other desk is its tasks alone. */
const ENQUIRY_DESKS = ['marketing', 'management'];
/* The desks that see the orders at risk of missing the EDD [components/DeliveryRisk.jsx]. */
const RISK_DESKS = ['production', 'marketing', 'management'];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'late', label: 'Late' },
  { key: 'today', label: 'Due today' },
  { key: 'unclaimed', label: 'Not assigned' },
  { key: 'mine', label: 'My jobs' },
];

function DepartmentDesk() {
  const { key = 'mine' } = useParams();
  const { user, departments, mayDelete, canRead, isAdmin } = useAuth();
  const fetch = useCallback(() => departmentsApi.dashboard(key), [key]);
  const { data, loading, error, reload } = useRecord(fetch, `department-${key}`);
  const [chosenTab, setTab] = useState(null);
  /* What the department finished this week: under the tasks, a toggle away. */
  const [showDone, setShowDone] = useState(false);
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
  /* Dispatch, Reception, Payment Collection, PRT and Accounts: a table by default, or the cards — remembered per desk on this device [DispatchTable, DeskTables]. */
  const [views, setViews] = useState({});
  const viewOf = (department) => views[department] || readView(department);
  const chooseView = (department, value) => {
    setViews((current) => ({ ...current, [department]: value }));
    try { localStorage.setItem(viewKeyOf(department), value); } catch { /* the choice just is not kept */ }
  };
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

  const { figures, requests: everyRequest = [], queries: everyQuery = [], recentlyDone, waitingOnOthers, cameBack, atStages, paymentsToConfirm } = data;
  const requests = deskTab ? everyRequest.filter((task) => task.department === deskTab) : everyRequest;
  /* Readiness queries from other teams [server: config/departmentTaskForms.js `readinessQuery`]: their own tab, apart from the order's work. */
  const queries = deskTab ? everyQuery.filter((row) => row.task.department === deskTab) : everyQuery;
  const deskCounts = deskList ? Object.fromEntries(deskList.map((key) => [key, everyRow.filter((row) => row.task.department === key).length])) : {};
  /* Sampling works from its own queue — the sample requests, as the team designed it. */
  const isSampling = figures.department === 'sampling';
  /*
   * Enquiries are marketing's and Admin's: only their desks list them. Every other department works
   * from its tasks, which carry what it needs — anyone given enquiry access opens them from the top
   * navigation, and a task still links to its enquiry.
   */
  const enquiryDesk = ENQUIRY_DESKS.includes(figures.department);
  const seesEnquiries = canRead('enquiries') && enquiryDesk;
  const everyone = isAdmin || figures.department === 'management';
  const seesAll = mayDelete;
  /* A shared desk: the tab above has picked the team, so its rows are one list. */
  const deskMembers = deskList || [figures.department];
  const bySection = (rows) => [{ key: 'all', label: null, rows }];
  /* The person's other desks, when they work in more than one department. */
  const otherDesks = departments.filter((entry) => !deskMembers.includes(entry));
  const late = enquiries.filter((row) => (isProduction ? eddBandOf(row) === 'late' : row.late)).length;
  const today = enquiries.filter((row) => (isProduction ? eddBandOf(row) === 'today' : row.dueToday)).length;
  const unclaimed = enquiries.filter((row) => !row.task.user).length;
  const mine = enquiries.filter((row) => String(row.task.user?._id || '') === me).length;
  /* Each filter carries its count, so the chips are the summary — no tiles above them to read twice. */
  const filterCounts = { all: enquiries.length, late, today, unclaimed, mine };
  const filters = isProduction ? PRODUCTION_FILTERS : FILTERS;
  /* A shared desk (Quality · Printing · Assembling) is titled by the team on screen. */
  const deskLabel = deskTab ? departmentLabel(deskTab) : figures.label;
  /* The links and notes under the desk: open for Admin and marketing, folded for everyone else. */
  const helpFolded = !everyone && !enquiryDesk;

  /*
   * One "Tasks" tab for every desk [TaskSections]: To do (what was sent to the department), We
   * asked (what it sent to other teams, still open), Replies (their answers this week), and what
   * it finished, a toggle away. Beside it only the views that are a job of their own: Sampling's
   * work queue, the Production / Printing / Assembly queues, Dispatch's delivery queue and trip
   * planning, and every enquiry for Admin and marketing.
   */
  const toDoCount = (isProduction || queueTeam ? 0 : enquiries.length) + queries.length + requests.length;
  /* Accounts' payments to confirm: a list of their own, above To do [components/PaymentsToConfirm.jsx]. */
  const toConfirm = paymentsToConfirm || null;
  const TABS = [
    ...(isSampling ? [{ key: 'queue', label: 'Work queue', count: null }] : []),
    ...(isProduction ? [{ key: 'pqueue', label: 'Production queue', count: null }] : []),
    ...(queueTeam ? [{ key: 'fqueue', label: TEAM_WORDS[queueTeam].queue, count: null }] : []),
    ...(seesEnquiries
      ? [{ key: 'all', label: everyone ? 'All enquiries' : figures.department === 'marketing' ? 'My enquiries' : 'All enquiries', count: null }]
      : []),
    { key: 'tasks', label: 'Tasks', count: toDoCount + (toConfirm?.length || 0) },
    /* Dispatch's delivery queue: every open request by the urgency marketing gave [DeliveryQueue]. */
    ...(data.baskets ? [{ key: 'delivery', label: 'Delivery queue', count: null }] : []),
    /* Dispatch plans its trips here: ready requests grouped by transporter, route and place [TripPlanner]. */
    ...(data.baskets ? [{ key: 'baskets', label: 'Plan trips', count: null }] : []),
  ];
  /* The desk opens where it always has: the queue for Production, Printing and Assembly, else the tasks. */
  const opening = firstDashboardTab(figures.department, { isAdmin: everyone, seesEnquiries });
  const fallback = opening === 'enquiries' ? (isProduction ? 'pqueue' : queueTeam ? 'fqueue' : 'tasks') : opening;
  const tab = TABS.some((entry) => entry.key === chosenTab) ? chosenTab : TABS.some((entry) => entry.key === fallback) ? fallback : 'tasks';

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={seesEnquiries ? `${figures.label} dashboard` : deskLabel}
        subtitle={isProduction || queueTeam ? 'Your jobs, the most urgent first. Press Open job to update one.'
          : seesEnquiries ? 'Your department’s tasks, and every enquiry you can see' : 'Your jobs, the most urgent first. Use the buttons on each job to update it.'}
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

      {/* The orders in danger of missing their EDD, where they are planned and promised: Production, Printing / Assembly, marketing, Admin. */}
      {RISK_DESKS.includes(figures.department) && <DeliveryRiskPanel />}


      {/* A desk with only its Tasks needs no tab bar — one tab is not a choice. */}
      <div className={`flex flex-wrap gap-1 rounded-xl border border-line/[0.06] bg-line/[0.02] p-1 ${TABS.length === 1 ? 'hidden' : ''}`} role="tablist">
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
      {tab === 'pqueue' && <ProductionQueueList compact />}

      {/* Printing's and Assembly's queues: the goods in hand to work, and what is still with the team before. */}
      {tab === 'fqueue' && queueTeam && <FinishingQueueList key={queueTeam} team={queueTeam} compact onChanged={reload} />}

      {tab === 'tasks' && (
        <div className="space-y-6">
          {toConfirm && (
            <TaskSection title="Payments to confirm" count={toConfirm.length} hint="Logged by Payment Collection or PRT — check each in the bank" tone="text-warn-400">
              <PaymentsToConfirm rows={toConfirm} onChanged={reload} />
            </TaskSection>
          )}
          <TaskSection title="To do" count={toDoCount} hint={`Work sent to ${deskLabel}`}>
            {isProduction || queueTeam ? (
              /* Production, Printing and Assembly work their orders from their queue tab. */
              <p className="rounded-lg bg-line/[0.04] px-3 py-2 text-sm text-steel-300">
                {isProduction ? enquiries.length : (deskCounts[queueTeam] ?? enquiries.length)} order{enquiries.length === 1 ? '' : 's'} on the{' '}
                <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setTab(isProduction ? 'pqueue' : 'fqueue')}>
                  {isProduction ? 'Production queue' : TEAM_WORDS[queueTeam].queue}
                </button>
                {' '}— worked there, in EDD order.
              </p>
            ) : isSoTeam ? (
              <SoDesk me={me} onChanged={reload} />
            ) : (
              <div className="space-y-4">
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {filters.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        onClick={() => setFilter(entry.key)}
                        aria-pressed={filter === entry.key}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                          filter === entry.key ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-line/[0.1] text-steel-300 hover:text-steel-100'
                        }`}
                      >
                        {entry.label}
                        {filterCounts[entry.key] !== undefined && (
                          <span className={`ml-1.5 tabular-nums ${entry.key === 'late' && filterCounts.late ? 'text-danger-400' : entry.key === 'today' && filterCounts.today ? 'text-warn-400' : 'text-steel-500'}`}>{filterCounts[entry.key]}</span>
                        )}
                      </button>
                    ))}
                    {TABLE_DESKS.includes(figures.department) && (
                      <div className="ml-auto flex rounded-lg border border-line/[0.1] p-0.5" role="group" aria-label={figures.department === 'despatch' ? 'Dispatch view' : `${figures.label} view`}>
                        {[['table', 'Table'], ['cards', 'Cards']].map(([value, label]) => (
                          <button key={value} type="button" aria-pressed={viewOf(figures.department) === value} onClick={() => chooseView(figures.department, value)}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${viewOf(figures.department) === value ? 'fill-primary' : 'text-steel-400 hover:text-steel-200'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
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
                  ) : figures.department === 'despatch' && viewOf('despatch') === 'table' && shown.length > 0 ? (
                    <DispatchTable rows={shown} me={me} onChanged={reload} />
                  ) : DESK_TABLE_KINDS[figures.department] && viewOf(figures.department) === 'table' && shown.some((row) => takesTable(figures.department, row)) ? (
                    <div className="space-y-5">
                      <DeskTables department={figures.department} rows={shown.filter((row) => takesTable(figures.department, row))} me={me} onChanged={reload} />
                      {/* Anything else on the desk — a task of another kind — stays a card below the tables. */}
                      {shown.some((row) => !takesTable(figures.department, row)) && (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {shown.filter((row) => !takesTable(figures.department, row)).map((row) => (
                            <EnquiryCard key={row.task._id} row={row} department={row.task.department || figures.department} me={me} onChanged={reload} />
                          ))}
                        </div>
                      )}
                    </div>
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
                    <p className="rounded-lg border border-dashed border-line/15 px-4 py-6 text-center text-sm text-steel-400">
                      {enquiries.length ? 'Nothing matches this filter — pick another, or clear the search.' : 'Nothing to do right now. Work sent to this department appears here.'}
                    </p>
                  )}
                </section>
              </div>
            )}
            {/* Printing, Assembly or Dispatch asking when goods will be ready [server: config/departmentTaskForms.js `readinessQuery`]. */}
            {queries.length > 0 && (
              <TaskGroup title="Other teams ask: when will it be ready?" count={queries.length} hint="Each answer goes back to the team that asked; Ready Now closes it.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {queries.map((row) => (
                    <EnquiryCard key={row.task._id} row={row} department={row.task.department} me={me} onChanged={reload} query />
                  ))}
                </div>
              </TaskGroup>
            )}
            {/* Jobs the app raised for the department: confirm a payment, cost an SO, a mould's maintenance. */}
            {requests.length > 0 && (
              <TaskGroup title="Other jobs for the department" count={requests.length}>
                <div className="card p-4"><HandoffTaskList tasks={requests} onChanged={reload} /></div>
              </TaskGroup>
            )}
          </TaskSection>

          <TaskSection title="We asked" count={waitingOnOthers.length} hint="What we sent to another team, still open with them" tone="text-aqua-300">
            {waitingOnOthers.length ? (
              <div className="card p-4"><HandoffTaskList tasks={waitingOnOthers} perspective="sender" onChanged={reload} /></div>
            ) : <p className="text-sm text-steel-500">Nothing we sent is still open.</p>}
          </TaskSection>

          <TaskSection title="Replies" count={cameBack.length} hint="Answers to what we asked, in the last 7 days" tone="text-success-400">
            {cameBack.length ? (
              <div className="card p-4"><HandoffTaskList tasks={cameBack} perspective="sender" /></div>
            ) : <p className="text-sm text-steel-500">No replies this week.</p>}
          </TaskSection>

          <div>
            <button type="button" className="link-muted text-sm" aria-expanded={showDone} onClick={() => setShowDone((value) => !value)}>
              {showDone ? 'Hide' : 'Show'} done this week ({recentlyDone.length})
            </button>
            {figures.onTimePercent !== null && figures.onTimePercent !== undefined && (
              <span className="ml-2 text-xs text-steel-500">{figures.onTimePercent}% on time</span>
            )}
            {showDone && (recentlyDone.length ? (
              <div className="card mt-2 p-4"><HandoffTaskList tasks={recentlyDone} /></div>
            ) : <p className="mt-1 text-sm text-steel-500">Nothing finished this week yet.</p>)}
          </div>
        </div>
      )}

      {tab === 'delivery' && (
        <section className="card space-y-3 p-5">
          <p className="text-sm text-steel-300">
            Every open request in the order it has to go: late first, then Top Most Urgent, Today Morning (by noon), Today Evening and Today (by 7 PM),
            Tomorrow. A request marketing has not confirmed reads Today — the day it reached Dispatch. Update each request’s status from its row; nothing here holds a dispatch.
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

      {helpFolded ? (
        <details className="rounded-xl border border-line/[0.06] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-steel-300">Help and links</summary>
          <div className="mt-3 space-y-5">
            <WorkspaceLinks department={figures.department} label={figures.label} atStages={enquiryDesk ? atStages : []} enquiries={enquiryDesk} />
            <WorkspaceBrief department={figures.department} label={figures.label} />
          </div>
        </details>
      ) : (
        <>
          <WorkspaceLinks department={figures.department} label={figures.label} atStages={enquiryDesk ? atStages : []} enquiries={enquiryDesk} />
          <WorkspaceBrief department={figures.department} label={figures.label} />
        </>
      )}
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
