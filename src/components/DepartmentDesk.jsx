import { useCallback, useEffect, useState } from 'react';
import { enquiries as enquiriesApi, handoffs as handoffsApi, orders as ordersApi } from '../api/endpoints.js';
import { Link } from 'react-router-dom';
import TaskPdfLink from './TaskPdfLink.jsx';
import { EddForm, EddLine, ModelEdds } from './TaskEdd.jsx';
import { DeliveryReading } from './DeliveryRisk.jsx';
import { useToast } from '../context/ToastContext.jsx';
import TaskCard from './TaskCard.jsx';
import EnquiryPayments from './EnquiryPayments.jsx';
import Menu from './Menu.jsx';
import DeliveryUrgencyPrompt from './DeliveryUrgencyPrompt.jsx';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import { TaskTimeline } from './TaskHistory.jsx';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Modal, Notice, Section } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, plural } from '../utils/format.js';
import { timelineOf } from '../utils/taskHistory.js';
import { bandOf } from '../utils/taskState.js';

/**
 * The enquiry's departments, and the tasks raised on them — the plant's own screen
 * [server: config/enquiryStages.js, config/handoffs.js, services/handoff.service.js].
 *
 * The enquiry stays with its marketing person; Admin sees every one. Clicking a department
 * raises that department's task, due by the end of the day, with the answers to the questions
 * the task asks (Sampling: mould, material, colour, preferred or compulsory) — and that task is
 * what the department's dashboard shows. Several departments can have tasks at once.
 *
 * Below the tiles, the tasks — each a card read at a glance [components/TaskCard.jsx] — in three
 * bands: the ones that need the reader (theirs, or their department's), the ones with somebody
 * else, and the finished ones folded to a line each. Or, switched to Timeline, everything that
 * happened on every task in the order it happened, filtered by department: the enquiry's story,
 * for a review or a call with the buyer.
 */

const BANDS = [
  { key: 'needs_you', label: 'Needs you', open: true },
  { key: 'in_progress', label: 'In progress', open: false },
  { key: 'done', label: 'Done', open: false },
];

/** The buttons that record rather than raise a task: Photos Sent, Task Closed. */
export function SendDialog({ button, enquiry, onClose, onSent }) {
  /* A button may arrive with its note written for it — Close after the LR says why already. */
  const [note, setNote] = useState(button?.note || '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!button) return null;

  const needsNote = button.key === 'task_closed';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await handoffsApi.send({ id: enquiry._id, kind: button.key, note });
      onSent();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={button.heading || button.label}
      description={button.hint}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label={needsNote ? 'Why it is being closed' : 'Note'}
          required={needsNote}
        >
          <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>
        {button.key === 'task_closed' && (
          <Notice tone="warn">Closing ends every task still open on this enquiry, except an LR Reception is still tracking to delivery. Nothing more can be sent on it.</Notice>
        )}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || (needsNote && note.trim().length < 3)}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** By task, or everything in time order — the two ways of reading what happened. */
function ViewToggle({ view, onChange }) {
  const option = (key, label) => (
    <button
      type="button"
      aria-pressed={view === key}
      onClick={() => onChange(key)}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${view === key ? 'bg-line/[0.1] text-steel-50' : 'text-steel-400 hover:text-steel-100'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-line/[0.08] p-0.5" role="group" aria-label="How to read the tasks">
      {option('tasks', 'By task')}
      {option('timeline', 'Timeline')}
    </div>
  );
}

const STEP_TONE = {
  done: 'border-success-500/50 bg-success-500/10 text-success-400',
  open: 'border-accent/60 bg-accent/10 text-accent',
  todo: 'border-line/[0.1] text-steel-500',
};
const JOURNEY_TITLE = {
  order: 'Order journey — SO to LR',
  production: 'Production journey — to dispatch',
  sample: 'Sample — ends at the sample',
  quotation: 'Quotation — ends at the quotation',
};

/**
 * Where the enquiry is on its journey, from the tasks themselves [server: journey.service
 * `journeyOf`], and what the floor is doing for it now — the mould running, what the runs made,
 * the work orders — so the enquiry, the production queue and the machines tell one story.
 */
function JourneyStrip({ journey, floor }) {
  const running = floor?.running || [];
  const made = floor?.made || { good: 0, rejected: 0, runs: 0 };
  const workOrders = floor?.workOrders || [];
  if (!journey?.steps?.length && !running.length && !made.runs && !workOrders.length) return null;
  return (
    <div className="space-y-2 rounded-xl border border-line/[0.1] bg-line/[0.02] px-3 py-2.5" aria-label="Journey">
      {journey?.steps?.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-steel-400">{JOURNEY_TITLE[journey.kind] || 'Journey'}</p>
          <ol className="flex flex-wrap items-center gap-1.5">
            {journey.steps.map((step, index) => (
              <li key={step.key} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true" className="text-steel-600">→</span>}
                <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${STEP_TONE[step.state] || STEP_TONE.todo}`} title={step.live || step.status || ''}>
                  {step.state === 'done' ? '✓ ' : ''}{step.label}{step.state === 'open' && step.status ? ` · ${step.status}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {running.map((run) => (
        <p key={run._id} className="text-sm text-steel-100">
          <span className="font-bold text-success-400"><span aria-hidden="true">● </span>Moulding now</span>
          <span className="text-steel-300">
            {' · '}{run.machine?.code || 'Press'} · {run.mould?.mouldCode || run.modelNumber || 'mould'}{run.colour ? ` · ${run.colour}` : ''}
            {' · '}{run.number} since {formatDate(run.startedAt)}
            {run.piecesSoFar != null ? ` · ${run.piecesSoFar.toLocaleString('en-IN')}${run.plannedQuantity ? ` / ${run.plannedQuantity.toLocaleString('en-IN')}` : ''} pcs` : run.plannedQuantity ? ` · ${run.plannedQuantity.toLocaleString('en-IN')} pcs to make` : ''}
          </span>
        </p>
      ))}
      {made.runs > 0 && (
        <p className="text-xs text-steel-300">
          Made so far: <span className="font-semibold text-steel-100">{made.good.toLocaleString('en-IN')} good</span>
          {made.rejected ? ` · ${made.rejected.toLocaleString('en-IN')} rejected` : ''} in {made.runs} run{made.runs === 1 ? '' : 's'}
        </p>
      )}
      {workOrders.length > 0 && (
        <ul className="space-y-0.5 text-xs text-steel-300">
          {workOrders.map((wo) => (
            <li key={wo._id}>
              {wo.number} · {wo.modelNumber || 'Line'} · {Number(wo.goodQty || 0).toLocaleString('en-IN')} / {Number(wo.quantity || 0).toLocaleString('en-IN')} made
              {' · '}{wo.status}{wo.machine?.code ? ` on ${wo.machine.code}` : ''}{wo.plannedEnd ? ` · planned end ${formatDate(wo.plannedEnd)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DepartmentDesk({ enquiry, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const { user, worksIn, canWrite, isManagement } = useAuth();
  const { toast, warn } = useToast();
  const [releasing, setReleasing] = useState(null);
  const [history, setHistory] = useState(null);
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(null);
  /* Marketing's own EDD on the enquiry: the form open, or not. */
  const [settingEdd, setSettingEdd] = useState(false);
  /* Marketing's final EDD per model: the form open, or not. */
  const [settingFinal, setSettingFinal] = useState(false);
  const [view, setView] = useState('tasks');
  const [showDone, setShowDone] = useState(false);
  const [feedDepartment, setFeedDepartment] = useState('');

  /* Again when the owner changes — a hand-over moves whose list the enquiry is on. */
  const owner = String(enquiry.assignedTo?._id || enquiry.assignedTo || '');
  const load = useCallback(() => {
    handoffsApi.list(enquiry._id).then(setHistory).catch((failure) => setProblem(failure.message));
  }, [enquiry._id, owner]);
  useEffect(load, [load]);

  const stage = history?.stage || enquiry.stage || 'enquiry';
  const closed = stage === 'closed';
  const tasks = history?.data || [];
  const me = String(user?.id || user?._id || '');
  const mayAct = (task) => user?.role === 'admin'
    || worksIn(task.department)
    || String(task.user?._id || task.user || '') === me;

  const refresh = () => {
    load();
    onChanged?.();
  };

  if (!catalogue) return null;
  const buttonOf = (task) => catalogue.buttons.find((item) => item.key === task.kind);
  const stages = catalogue.stages.filter((item) => item.number);
  const holder = history?.holder || null;
  /* Nothing is raised on details nobody has checked [server: Enquiry `checkPending`]. */
  const awaitingCheck = Boolean(enquiry.checkPending);
  const mayMove = Boolean(history?.mayMove) && !awaitingCheck;
  const holderButton = holder && catalogue.buttons.find((item) => item.key === holder.kind);
  /* The enquiry's own owner by name — marketing or an Admin who took it on; a department by its name. */
  const holderName = !holder
    ? ''
    : holderButton?.department === 'owner' && holder.user?.name
      ? holder.user.name
      : `${departmentLabel(holder.department)}${holder.user?.name ? ` (${holder.user.name})` : ''}`;
  const holderLate = holder?.dueDate && new Date(holder.dueDate) < new Date();
  /* The enquiry's own holding task: its follow-up date is the one thing to change on it. */
  const holding = tasks.find((task) => task.holds && !task.completed);
  const drawn = catalogue.buttons.filter((button) => !button.hidden);
  const closeButton = catalogue.buttons.find((button) => button.key === 'task_closed');
  /* Which departments have a task open right now — several can, at once. */
  const openTasks = tasks.filter((task) => !task.completed && !task.holds);
  const openFor = (department) => openTasks.filter((task) => task.department === department).length;
  /* The work the departments sent back as a file — the sales order — newest first, at the top. */
  const results = tasks.filter((task) => task.resultFile?.key);
  /*
   * When the goods will be ready, while the enquiry is in Production (or Assembly): the EDD
   * Production gave, or that it has been asked and not given yet, and each order line's own date.
   */
  const production = history?.production;
  const inProduction = ['production_edd', 'assembling'].includes(stage) || Boolean(production?.asked);
  /*
   * The EDD is marketing's to set from the order on — the date the buyer is working to, before
   * or instead of waiting for Production to give one [server: pipeline.controller `setEnquiryEdd`].
   * The box shows from the order stage, or as soon as a date or a Production task exists.
   */
  const fromOrder = !['enquiry', 'sample', 'pricing_quote'].includes(stage);
  const maySetEdd = canWrite('enquiries') && !closed;
  const showEdd = !closed && production && (inProduction || fromOrder || Boolean(production.edd));
  const setFinal = async ({ date, models, note }) => {
    const rows = models || production.byModel.map((row) => ({ model: row.model, date }));
    await enquiriesApi.setModelEdds({ id: enquiry._id, models: rows, note });
    toast('EDD per model saved', 'Production, Printing, Assembly and Dispatch are told.');
    setSettingFinal(false);
    refresh();
  };
  /* The open Dispatch request, whose delivery urgency marketing or Admin gives [DeliveryUrgencyPrompt]. */
  const dispatchRequest = tasks.find((task) => task.kind === 'invoice_dispatch' && !task.completed) || null;
  /* How a several-model order goes out, and which models are ready [server: handoff.service `modelReadiness`]. */
  const readiness = history?.readiness || { ready: [], waiting: [] };
  const modelCount = readiness.ready.length + readiness.waiting.length;
  const plan = history?.dispatchPlan?.mode || 'together';
  const setPlan = async (mode) => {
    try {
      await enquiriesApi.setDispatchPlan({ id: enquiry._id, mode });
      toast(mode === 'by_model' ? 'Each model goes as it is ready' : 'All models go together', 'Dispatch and the teams are told.');
      refresh();
    } catch (failure) {
      warn('Dispatch plan not saved', failure.message);
    }
  };
  const setEdd = async ({ date, note }) => {
    await enquiriesApi.setEdd({ id: enquiry._id, date, note });
    toast(`EDD ${formatDate(date)}`, 'Production and Dispatch see it on their tasks.');
    setSettingEdd(false);
    refresh();
  };

  /*
   * A Production Holded Order: the SO is prepared but Production was not confirmed on the
   * request. Admin or the enquiry's marketing person (whoever it is delegated to now) sends it
   * on to Production [server: handoff.service `mayReleaseHeld`].
   */
  const held = stage === 'production_hold';
  const mayRelease = held && !awaitingCheck && (isManagement || owner === me);
  const productionButton = catalogue.buttons.find((button) => button.key === 'ask_edd');

  /*
   * The enquiry's sales orders, and whether each has gone to the plant — released here or on the
   * Sales orders screen, it reads the same [server: handoff.controller `ordersOnEnquiry`].
   */
  const orders = history?.orders || [];
  const releaseOrder = async (order) => {
    setReleasing(order._id);
    try {
      await ordersApi.act({ id: order._id, expectedUpdatedAt: order.updatedAt, action: 'release' });
      toast(`${order.number} released to production`, 'Production has its task.');
      refresh();
    } catch (failure) {
      warn(`${order.number} not released`, failure.message);
    } finally {
      setReleasing(null);
    }
  };

  /* The work itself — the holding task is the enquiry, said above, not a card. */
  const work = tasks.filter((task) => !task.holds);
  const bands = BANDS.map((band) => ({
    ...band,
    tasks: work.filter((task) => bandOf(task, buttonOf(task), { me, worksIn, owner }) === band.key),
  })).filter((band) => band.tasks.length);
  const openCount = work.filter((task) => !task.completed).length;

  /* "+ Raise a task": every button, under its department; the record-only ones last. */
  const raise = [...drawn.filter((button) => button.department), ...drawn.filter((button) => !button.department)].map((button) => ({
    key: button.key,
    label: button.label,
    hint: button.hint,
    group: button.department ? departmentLabel(button.department) : 'Record',
    onSelect: () => setSending(button),
  }));

  /* The timeline across every task: each entry says which task it is from. */
  const labelOf = (kind) => catalogue.buttons.find((entry) => entry.key === kind)?.label || 'next step';
  const feed = work
    .flatMap((task) => {
      const button = buttonOf(task);
      return timelineOf(task, button, { labelOf }).map((entry) => ({
        ...entry, source: button?.label || task.title, department: task.department, statuses: button?.form?.statuses || [],
      }));
    })
    .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  const feedDepartments = [...new Set(work.map((task) => task.department))];
  const shownFeed = feedDepartment ? feed.filter((entry) => entry.department === feedDepartment) : feed;

  return (
    <Section title="Departments" actions={work.length > 0 ? <ViewToggle view={view} onChange={setView} /> : undefined}>
      <div className="space-y-4">
        <JourneyStrip journey={history?.journey} floor={history?.floor} />
        {showEdd && (
          <div className={`rounded-xl border px-3 py-2.5 ${production.edd ? 'border-accent/40 bg-accent/[0.07]' : 'border-warn-500/40 bg-warn-500/[0.07]'}`} aria-label="Expected delivery">
            <div className="flex flex-wrap items-start justify-between gap-2">
              {production.edd ? (
                <EddLine edd={{ date: production.edd.edd, department: production.edd.department, by: production.edd.by ? { name: production.edd.by } : null, at: production.edd.at, note: production.edd.note || (production.edd.pending ? `${Number(production.edd.pending).toLocaleString('en-IN')} pcs pending` : '') }} />
              ) : (
                <p className="text-sm text-steel-100">
                  <span className="font-bold text-warn-400">EDD not set yet</span>
                  <span className="text-steel-400"> · {maySetEdd ? 'set the date the buyer is promised — the production queue runs by it' : 'marketing gives the date the buyer is promised'}</span>
                </p>
              )}
              {maySetEdd && !settingEdd && (
                <button type="button" className="row-action" onClick={() => setSettingEdd(true)}>{production.edd ? 'Change EDD' : 'Set EDD'}</button>
              )}
            </div>
            {settingEdd && <EddForm onSave={setEdd} onCancel={() => setSettingEdd(false)} label={production.edd ? 'Change EDD' : 'Set EDD'} />}
            {/* The plant's own dates, beside the EDD: when the last team on each model says it will be finished [server: refreshModelEdds]. */}
            {production.completion?.date && (
              <p className={`mt-1 text-sm ${production.edd && production.completion.date > production.edd.edd ? 'font-semibold text-danger-400' : 'text-steel-200'}`}>
                <span className="font-bold">Plant’s completion {formatDate(production.completion.date)}</span>
                <span className="text-steel-400">{production.completion.complete ? ' — every model' : ' — the models dated so far'}</span>
                {production.edd && production.completion.date > production.edd.edd ? ' — after the EDD' : ''}
              </p>
            )}
            {/* Each model: its EDD, each team's hand-over or completion date. */}
            {production.byModel?.length > 0 && <ModelEdds rows={production.byModel} edd={production.edd?.edd || null} className="mt-1.5" />}
            {/* Will it make the EDD — the work left on every model at the plant's usual pace [server: deliveryRisk.service]. */}
            <DeliveryReading risk={history?.risk} className="mt-2" />
            {/* Marketing's EDD for one model apart from the rest, when the buyer is committed to another day for it. */}
            {maySetEdd && production.byModel?.length > 1 && !settingFinal && (
              <button type="button" className="row-action mt-1" onClick={() => setSettingFinal(true)}>Set EDD per model</button>
            )}
            {settingFinal && (
              <EddForm
                onSave={setFinal}
                onCancel={() => setSettingFinal(false)}
                label="Save EDD per model"
                dateLabel="EDD"
                models={production.byModel.map((row) => row.model)}
                given={Object.fromEntries(production.byModel.map((row) => [row.model, row.final?.date || production.edd?.edd || '']))}
              />
            )}
            {production.asked?.status && (
              <p className="mt-0.5 text-xs text-steel-300">Production status: <span className="font-semibold text-steel-100">{production.asked.status}</span></p>
            )}
            {production.lines?.some((line) => line.expectedCompletion || line.dueToBuyer) && (
              <ul className="mt-1 space-y-0.5 text-xs text-steel-300">
                {production.lines.map((line) => (
                  <li key={`${line.order}-${line.model}`}>
                    {line.order} · {line.model || 'Line'}
                    {line.expectedCompletion ? ` — plant expects ${formatDate(line.expectedCompletion)}` : ''}
                    {line.dueToBuyer ? ` (buyer ${formatDate(line.dueToBuyer)})` : ''}
                    {line.quantity ? ` · ${Number(line.produced || 0).toLocaleString('en-IN')} / ${Number(line.quantity).toLocaleString('en-IN')} made` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {results.length > 0 && (
          <div className="space-y-2" aria-label="Uploaded by departments">
            {results.map((task) => {
              const button = buttonOf(task);
              return (
                <div key={task._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success-500/40 bg-success-500/[0.07] px-3 py-2.5">
                  <p className="text-sm text-steel-100">
                    <span className="font-bold">{button?.form?.resultTitle || button?.label || 'Document'} uploaded</span>
                    <span className="text-steel-400">
                      {' · '}{departmentLabel(task.department)}
                      {task.completedBy?.name ? ` · ${task.completedBy.name}` : ''}
                      {task.completedAt ? ` · ${formatDate(task.completedAt)}` : ''}
                    </span>
                  </p>
                  <TaskPdfLink file={task.resultFile} className="text-sm" />
                </div>
              );
            })}
          </div>
        )}
        {/* With Dispatch: how soon the buyer needs it — Today (the day it reached Dispatch) until marketing or Admin confirms or changes it. */}
        {dispatchRequest && (
          <DeliveryUrgencyPrompt task={dispatchRequest} maySet={isManagement || owner === me} about={`Invoice & Dispatch — ${enquiry.number}`} onSaved={refresh} />
        )}
        {modelCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/[0.1] bg-line/[0.02] px-3 py-2.5" aria-label="Dispatch plan">
            <div className="text-sm text-steel-100">
              <span className="font-bold">Dispatch plan</span>
              <span className="text-steel-300"> · {plan === 'by_model' ? 'each model as it is ready' : 'all models together'}</span>
              <p className="text-xs text-steel-400">
                {readiness.sent?.length > 0 && `Sent: ${readiness.sent.join(', ')} · `}
                Ready: {readiness.ready.filter((model) => !(readiness.sent || []).includes(model)).join(', ') || 'none yet'}
                {readiness.waiting.length > 0 && ` · waiting: ${readiness.waiting.map((row) => `${row.model} (${row.team === 'assembling' ? 'Assembly' : row.team === 'printing' ? 'Printing' : 'Production'})`).join(', ')}`}
              </p>
            </div>
            {canWrite('enquiries') && !closed && (
              <select className="input w-auto py-1.5 text-sm" aria-label="Dispatch plan" value={plan} onChange={(event) => setPlan(event.target.value)}>
                <option value="together">Dispatch all together</option>
                <option value="by_model">Dispatch each model as it is ready</option>
              </select>
            )}
          </div>
        )}
        {orders.length > 0 && (
          <div className="space-y-2" aria-label="Sales orders">
            {orders.map((order) => (
              <div
                key={order._id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                  order.released ? 'border-success-500/40 bg-success-500/[0.07]' : order.mayRelease ? 'border-accent/40 bg-accent/[0.06]' : 'border-line/[0.1] bg-line/[0.02]'
                }`}
              >
                <p className="text-sm text-steel-100">
                  <Link to={`/orders/${order._id}`} className="font-bold hover:text-accent">{order.number}</Link>
                  <span className="text-steel-400">
                    {order.poNumber ? ` · PO ${order.poNumber}` : ''}
                    {order.quantity ? ` · ${Number(order.quantity).toLocaleString('en-IN')} pcs` : ''}
                  </span>
                  {order.released ? (
                    <span className="block text-xs font-semibold text-success-400">
                      Released to production {formatDate(order.released.at)}{order.released.by ? ` · ${order.released.by}` : ''}
                    </span>
                  ) : order.waiting ? (
                    <span className={`block text-xs ${order.checksShort.length || order.advanceShort ? 'text-warn-400' : 'font-semibold text-accent'}`}>
                      {[
                        order.checksShort.length > 0 && `still needs ${order.checksShort.join(', ').toLowerCase()}`,
                        /* The advance its terms ask for: logged by Payment Collection, confirmed by Accounts [server: paymentGates]. */
                        order.advanceShort > 0 && `waiting for the advance — ₹${Math.round(order.advanceShort).toLocaleString('en-IN')} not yet confirmed by Accounts`,
                      ].filter(Boolean).join(' · ').replace(/^./, (first) => `Not released — ${first}`) || 'Confirmed — ready to release to production'}
                    </span>
                  ) : null}
                </p>
                {order.mayRelease && (
                  <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={releasing === order._id} onClick={() => releaseOrder(order)}>
                    {releasing === order._id ? 'Releasing…' : 'Release to production'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* The money on it: the advance and each invoice, and every payment logged on them. */}
        <EnquiryPayments payments={history?.payments} />
        {held && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-warn-500/50 bg-warn-500/[0.08] px-3 py-2.5" aria-label="Production Holded Order">
            <p className="text-sm text-steel-100">
              <span className="font-bold text-warn-400">Production Holded Order</span>
              <span className="text-steel-300">
                {' · '}The SO is prepared, but Production was not confirmed.
                {mayRelease ? ' Move it on once the buyer confirms.' : ` Waiting for Admin or ${enquiry.assignedTo?.name || 'its marketing person'} to move it to Production.`}
              </span>
            </p>
            {mayRelease && productionButton && (
              <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => setSending({ ...productionButton, heading: 'Move to Production — Ask EDD' })}>
                Move to Production
              </button>
            )}
          </div>
        )}
        {/*
          * The departments, as the plant numbers them. Where the work is now is lit green; a
          * department with a task open says so. Clicking one opens its task form, filled from
          * the enquiry [components/DepartmentTaskDialog.jsx], and raises its task
          * [server: config/handoffs.js TILE_KIND] — for its marketing person, whoever has it and
          * Admin. The first is marketing's own: the enquiry is always theirs.
          */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stages.map((item) => {
            const here = item.key === stage;
            const open = openFor(item.department);
            const sends = !closed && mayMove && catalogue.buttons.find((button) => button.key === item.kind);
            const look = `flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-xs leading-tight ${
              here
                ? 'border-success-500/60 bg-success-500/10 font-bold text-success-400'
                : open ? 'border-warn-500/50 text-steel-200' : 'border-line/[0.08] text-steel-400'
            }`;
            const inside = (
              <>
                <span>{item.number}. {item.label}</span>
                {open > 0 && <span className="mt-0.5 text-[0.75rem] font-semibold text-warn-400">{open === 1 ? 'Task open' : `${open} tasks open`}</span>}
              </>
            );
            if (!sends) {
              return <div key={item.key} aria-current={here ? 'step' : undefined} className={look}>{inside}</div>;
            }
            return (
              <button
                key={item.key}
                type="button"
                aria-current={here ? 'step' : undefined}
                title={`Raise a ${departmentLabel(item.department)} task`}
                onClick={() => setSending({ ...sends, heading: `${item.number}. ${item.label} — ${sends.label}` })}
                className={`${look} transition-colors hover:border-success-500/60 hover:text-success-400 focus-visible:border-success-500/60`}
              >
                {inside}
              </button>
            );
          })}
        </div>
        {closed && <Notice tone="info">This enquiry is closed.</Notice>}

        {/*
          The LR is in: the order has gone. Closing is a person's call — another lorry may still
          be due — so the enquiry stays open and this offers the close, with the reason written.
        */}
        {!closed && mayMove && history?.lrUploaded && closeButton && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-success-500/40 bg-success-500/[0.08] px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-steel-50">LR uploaded and sent to the buyer</p>
              <p className="text-xs text-steel-300">When every lorry for this order has gone, close the enquiry. Reception can still mark the goods delivered.</p>
            </div>
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={() => setSending({ ...closeButton, heading: 'Close the enquiry', note: 'LR sent to the buyer — order complete' })}
            >
              Close enquiry
            </button>
          </div>
        )}

        {/* Whose enquiry it is — its marketing person, wherever its work is — and what can be raised on it. */}
        {!closed && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-accent/30 bg-accent/[0.05] px-3 py-2 text-sm">
            <div className="min-w-0">
              {holder && (
                <p className="text-steel-100">
                  <span className="text-steel-400">Enquiry with </span>
                  <span className="font-semibold">{holderName}</span>
                  {holderButton && holderButton.department !== 'owner' && <span className="text-steel-400"> · {holderButton.label}</span>}
                  {openCount > 0 && <span className="text-steel-400"> · {plural(openCount, 'task', 'tasks')} open</span>}
                </p>
              )}
              {holder?.dueDate && (
                <p className={`flex flex-wrap items-center gap-x-2 text-xs ${holderLate ? 'text-danger-400' : 'text-steel-400'}`}>
                  <span>{holderLate ? `Follow-up late — was due ${formatDate(holder.dueDate)}` : `Follow-up ${formatDate(holder.dueDate)}`}</span>
                  {holding && mayAct(holding) && <HandoffTaskActions todo={holding} onChanged={refresh} />}
                </p>
              )}
              {!holder && <p className="text-xs text-steel-500">Tap a department above to raise its task.</p>}
            </div>
            {mayMove && (
              <Menu label="+ Raise a task" items={raise} align="right" buttonClassName="btn-primary px-3 py-1.5 text-xs" />
            )}
            {!mayMove && (
              <p className={`text-xs ${awaitingCheck ? 'font-semibold text-warn-400' : 'text-steel-500'}`}>
                {awaitingCheck
                  ? 'Check pending — correct the enquiry details and Save & Mark as Checked before raising a task.'
                  : `${holderName || 'Its marketing person'} or Admin raise department tasks on it.`}
              </p>
            )}
          </div>
        )}

        {problem && <Notice tone="danger">{problem}</Notice>}

        {work.length > 0 && view === 'tasks' && (
          <div className="space-y-4">
            {bands.map((band) => {
              const folded = band.key === 'done' && openCount > 0 && !showDone;
              return (
                <div key={band.key}>
                  {band.key === 'done' && openCount > 0 ? (
                    <button
                      type="button"
                      className="eyebrow mb-1.5 inline-flex items-center gap-1.5 hover:text-steel-100"
                      aria-expanded={!folded}
                      onClick={() => setShowDone((value) => !value)}
                    >
                      {band.label} · {band.tasks.length}
                      <span aria-hidden className={`text-xs transition-transform ${folded ? '' : 'rotate-180'}`}>▼</span>
                    </button>
                  ) : (
                    <p className="eyebrow mb-1.5">{band.label} · {band.tasks.length}</p>
                  )}
                  {!folded && (
                    <ul className="space-y-2" aria-label={band.label}>
                      {band.tasks.map((task) => (
                        <TaskCard
                          key={task._id}
                          task={task}
                          mayAct={mayAct(task)}
                          open={band.open && openCount <= 4}
                          onChanged={refresh}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {work.length > 0 && view === 'timeline' && (
          <div className="space-y-3">
            {feedDepartments.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Department">
                {[['', 'All'], ...feedDepartments.map((key) => [key, departmentLabel(key)])].map(([key, label]) => (
                  <button
                    key={key || 'all'}
                    type="button"
                    aria-pressed={feedDepartment === key}
                    onClick={() => setFeedDepartment(key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${feedDepartment === key ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line/[0.1] text-steel-300 hover:text-steel-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <TaskTimeline entries={shownFeed} />
          </div>
        )}
      </div>

      {sending && (
        sending.department ? (
          <DepartmentTaskDialog enquiry={enquiry} catalogue={catalogue} kind={sending.key} onClose={() => setSending(null)} onSent={refresh} />
        ) : (
          <SendDialog button={sending} enquiry={enquiry} onClose={() => setSending(null)} onSent={refresh} />
        )
      )}
    </Section>
  );
}
