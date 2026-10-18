import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { mouldRunsApi, orders as ordersApi, workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorState, Field, FormError, Modal, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { EnquirySelect, MaterialSelect, MouldSelect } from '../components/pickers.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import { RunsTable } from '../components/RecordTables.jsx';
import { formatNumber } from '../utils/format.js';
import { SHIFTS } from '../utils/records.js';
import { CodedRows, codedForSave, useRunReasons } from '../components/RunReasons.jsx';

/**
 * Mould runs [server: records.service `startRun` / `finishRun`]: which mould is on which machine for
 * which order. What is running now comes first, each with Finish; below, the runs that ended. One run
 * at a time on a machine and on a mould — the server refuses a second and names the one going.
 * Finishing adds the run's shots to the mould's life count, which is what its maintenance is due on.
 */

const number = (value) => (value === '' || value == null ? undefined : Number(value));
const elapsed = (from) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(from)) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

function StartRun({ onClose, onStarted, initial = {} }) {
  const [values, setValues] = useState({ mould: '', machine: '', enquiry: initial.enquiry || '', order: initial.order || '', orderLine: '', colour: '', plannedQuantity: '', shift: '', operator: '', counterStart: '', resinMaterial: '', resinName: '', resinBatch: '' });
  /* Started from a work order: its mould, order and line are taken from it [server: `startRun`]. */
  const [workOrder, setWorkOrder] = useState(null);
  useEffect(() => {
    if (!initial.workOrder) return undefined;
    let live = true;
    workOrdersApi.get(initial.workOrder).then((wo) => {
      if (!live) return;
      setWorkOrder(wo);
      setValues((current) => ({ ...current, machine: current.machine || wo.machine?._id || '', colour: current.colour || wo.colour || '', plannedQuantity: current.plannedQuantity || String(wo.toMakeQty || '') }));
    }).catch(() => null);
    return () => { live = false; };
  }, [initial.workOrder]);
  /* The enquiry's SOs, to say which SO line the run makes — its good pieces are added to that line. */
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    let live = true;
    if (!values.enquiry) { setOrders([]); return undefined; }
    ordersApi.list({ enquiry: values.enquiry, open: 'true', limit: 20 }).then((answer) => live && setOrders(answer?.data || [])).catch(() => live && setOrders([]));
    return () => { live = false; };
  }, [values.enquiry]);
  const chosenOrder = orders.find((row) => row._id === values.order) || (orders.length === 1 ? orders[0] : null);
  const needsOrder = orders.length > 1 && !values.order;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (value) => setValues((current) => ({ ...current, [key]: value?.target ? value.target.value : value }));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await mouldRunsApi.start({
        ...(workOrder ? { workOrder: workOrder._id } : {}),
        mould: workOrder ? undefined : values.mould,
        machine: values.machine || undefined,
        enquiry: values.enquiry || undefined,
        order: values.order || undefined,
        orderLine: values.orderLine || undefined,
        colour: values.colour,
        plannedQuantity: number(values.plannedQuantity),
        shift: values.shift || undefined,
        operator: values.operator,
        counterStart: number(values.counterStart),
        resin: values.resinMaterial || values.resinName || values.resinBatch ? { material: values.resinMaterial || undefined, name: values.resinName, batch: values.resinBatch } : undefined,
      });
      onStarted();
      onClose();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Start a run" description="One mould on one machine. Finish it when the mould comes off." size="lg">
      <form onSubmit={save} className="space-y-4">
        {workOrder && (
          <div className="rounded-xl border border-accent/30 bg-accent/[0.05] px-3 py-2 text-sm">
            <p className="font-semibold text-steel-100">{workOrder.number} · {workOrder.mould?.mouldCode || workOrder.modelNumber}</p>
            <p className="text-xs text-steel-400">{[workOrder.customer?.name, workOrder.order?.number, workOrder.colour, `${formatNumber(workOrder.toMakeQty)} of ${formatNumber(workOrder.quantity)} still to make`].filter(Boolean).join(' · ')}</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {!workOrder && <Field label="Mould" required><MouldSelect value={values.mould} onChange={set('mould')} allowCreate={false} /></Field>}
          <Field label="Machine"><MachineSelect value={values.machine} onChange={set('machine')} emptyLabel="Pick the machine…" /></Field>
          {!workOrder && <Field label="For enquiry / order" className="sm:col-span-2"><EnquirySelect value={values.enquiry} onChange={(value) => setValues((current) => ({ ...current, enquiry: value, order: '', orderLine: '' }))} won emptyLabel="Stock run — no order" fallbackLabel={values.enquiry && values.enquiry === initial.enquiry ? initial.label : undefined} /></Field>}
          {!workOrder && orders.length > 0 && (
            <Field label="Sales order" hint="Good pieces are added to the SO line when the run ends">
              <select className="input" value={values.order} onChange={(event) => setValues((current) => ({ ...current, order: event.target.value, orderLine: '' }))}>
                <option value="">{orders.length > 1 ? 'Pick the SO…' : orders[0].number}</option>
                {orders.length > 1 && orders.map((row) => <option key={row._id} value={row._id}>{row.number}</option>)}
              </select>
            </Field>
          )}
          {!workOrder && chosenOrder?.lines?.length > 1 && (
            <Field label="Line of the order" hint="Left empty, the line on this mould">
              <select className="input" value={values.orderLine} onChange={set('orderLine')}>
                <option value="">The line on this mould</option>
                {chosenOrder.lines.map((line) => <option key={line._id} value={line._id}>{[line.modelNumber, line.colour, line.quantity && `${line.quantity} pcs`].filter(Boolean).join(' · ')}</option>)}
              </select>
            </Field>
          )}
          <Field label="Colour"><input className="input" value={values.colour} onChange={set('colour')} maxLength={60} /></Field>
          <Field label="Pieces planned"><input type="number" min={0} className="input" value={values.plannedQuantity} onChange={set('plannedQuantity')} /></Field>
          <Field label="Shift">
            <select className="input" value={values.shift} onChange={set('shift')}>
              <option value="">—</option>
              {SHIFTS.map((shift) => <option key={shift} value={shift}>{shift === 'General' ? 'General' : `Shift ${shift}`}</option>)}
            </select>
          </Field>
          <Field label="Operator"><input className="input" value={values.operator} onChange={set('operator')} maxLength={80} /></Field>
          <Field label="Shot counter at start" hint="Leave empty to carry on from the mould's own count"><input type="number" min={0} className="input" value={values.counterStart} onChange={set('counterStart')} /></Field>
          <Field label="Resin from the store" hint="What the run uses is taken out of its stock when it ends"><MaterialSelect value={values.resinMaterial} onChange={set('resinMaterial')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Resin"><input className="input" value={values.resinName} onChange={set('resinName')} maxLength={80} placeholder="PP" /></Field>
            <Field label="Resin batch"><input className="input" value={values.resinBatch} onChange={set('resinBatch')} maxLength={60} /></Field>
          </div>
        </div>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || (!workOrder && (!values.mould || needsOrder))}>{busy ? 'Starting…' : 'Start the run'}</button>
        </div>
      </form>
    </Modal>
  );
}

function FinishRun({ run, onClose, onFinished }) {
  const reasons = useRunReasons();
  const [values, setValues] = useState({ counterEnd: '', goodPieces: '', rejectedPieces: '', usedKg: '', regrindKg: '', downtimeReason: '', issues: '', aborted: false });
  /* Stops and rejects by coded reason, beside any logged while it ran. */
  const [stops, setStops] = useState([]);
  const [defects, setDefects] = useState([]);
  const loggedStops = (run.downtime || []).reduce((sum, entry) => sum + (entry.minutes || 0), 0);
  const loggedRejects = (run.rejects || []).reduce((sum, entry) => sum + (entry.pieces || 0), 0);
  const codedRejects = loggedRejects + codedForSave(defects, 'pieces').reduce((sum, entry) => sum + entry.pieces, 0);
  const rejectsOver = values.rejectedPieces !== '' && codedRejects > Number(values.rejectedPieces);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const shots = values.counterEnd === '' || run.counterStart == null ? null : Number(values.counterEnd) - run.counterStart;
  const expected = shots != null && shots >= 0 && run.cavitiesRunning ? shots * run.cavitiesRunning : null;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await mouldRunsApi.finish({
        id: run._id,
        counterEnd: number(values.counterEnd),
        goodPieces: number(values.goodPieces),
        rejectedPieces: number(values.rejectedPieces),
        regrindKg: number(values.regrindKg),
        downtime: codedForSave(stops, 'minutes'),
        rejects: codedForSave(defects, 'pieces'),
        downtimeReason: values.downtimeReason || undefined,
        issues: values.issues,
        resin: values.usedKg !== '' ? { usedKg: number(values.usedKg) } : undefined,
        aborted: values.aborted || undefined,
      });
      onFinished();
      onClose();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Finish ${run.number}`} description={`${run.mould?.mouldCode || ''}${run.machine ? ` on ${run.machine.code}` : ''} — started at ${formatNumber(run.counterStart ?? 0)} shots`} size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Shot counter now" hint={shots != null ? (shots < 0 ? 'Below where it started' : `${formatNumber(shots)} shots${expected != null ? ` · about ${formatNumber(expected)} pieces at ${run.cavitiesRunning} cavities` : ''}`) : undefined}>
            <input type="number" min={run.counterStart ?? 0} className="input" value={values.counterEnd} onChange={set('counterEnd')} />
          </Field>
          <Field label="Good pieces"><input type="number" min={0} className="input" value={values.goodPieces} onChange={set('goodPieces')} /></Field>
          <Field label="Rejected pieces"><input type="number" min={0} className="input" value={values.rejectedPieces} onChange={set('rejectedPieces')} /></Field>
          <Field label="Resin used, kg"><input type="number" min={0} step="any" className="input" value={values.usedKg} onChange={set('usedKg')} /></Field>
          <Field label="Regrind, kg"><input type="number" min={0} step="any" className="input" value={values.regrindKg} onChange={set('regrindKg')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            {loggedStops > 0 && <p className="text-xs text-steel-400">{formatNumber(loggedStops)} minutes of stops logged while it ran</p>}
            <CodedRows label="Stops" options={reasons.downtime} rows={stops} onChange={setStops} unit="minutes" unitLabel="minutes" addLabel="+ Add a stop" />
          </div>
          <div className="space-y-1">
            {loggedRejects > 0 && <p className="text-xs text-steel-400">{formatNumber(loggedRejects)} rejects logged while it ran</p>}
            <CodedRows label="Rejects by defect" options={reasons.rejects} rows={defects} onChange={setDefects} unit="pieces" unitLabel="pieces" addLabel="+ Add a defect" />
          </div>
        </div>
        {rejectsOver && <p className="text-xs text-warn-400">The rejects by defect add up to {formatNumber(codedRejects)}, more than the rejected pieces typed.</p>}
        <Field label="Stop note" hint="Anything the reason does not say — which heater band, how long the power was out"><input className="input" value={values.downtimeReason} onChange={set('downtimeReason')} maxLength={300} /></Field>
        <Field label="Problems seen"><textarea className="input" value={values.issues} onChange={set('issues')} maxLength={2000} /></Field>
        <label className="flex items-center gap-2 text-sm text-steel-200">
          <input type="checkbox" checked={values.aborted} onChange={set('aborted')} />
          Stopped before the planned quantity — taken off early
        </label>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || (shots != null && shots < 0) || rejectsOver}>{busy ? 'Saving…' : 'Finish the run'}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * A line on a running job, from the floor [server: records.service `logRun`]: the shot counter
 * read now, a stop with its reason, or rejects by defect. Each is kept on the run; the totals follow.
 */
export function LogRun({ run, onClose, onLogged }) {
  const reasons = useRunReasons();
  const last = (run.counterLog || []).at(-1)?.counter ?? run.counterStart ?? 0;
  const [counter, setCounter] = useState('');
  const [stop, setStop] = useState({ reason: '', minutes: '' });
  const [defect, setDefect] = useState({ reason: '', pieces: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const counterBack = counter !== '' && Number(counter) < last;
  const hasStop = stop.reason && Number(stop.minutes) > 0;
  const hasDefect = defect.reason && Number(defect.pieces) > 0;
  const something = (counter !== '' && !counterBack) || hasStop || hasDefect;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await mouldRunsApi.log({
        id: run._id,
        ...(counter !== '' ? { counter: Number(counter) } : {}),
        ...(hasStop ? { downtime: { reason: stop.reason, minutes: Number(stop.minutes) } } : {}),
        ...(hasDefect ? { rejects: { reason: defect.reason, pieces: Number(defect.pieces) } } : {}),
      });
      onLogged();
      onClose();
    } catch (failure) {
      setProblem(failure);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Log on ${run.number}`} description={`${run.mould?.mouldCode || ''}${run.machine ? ` on ${run.machine.code}` : ''} — last counter ${formatNumber(last)}`}>
      <form onSubmit={save} className="space-y-4" aria-label="Log on the run">
        <Field label="Shot counter now" hint={counterBack ? 'Below the last reading' : counter !== '' ? `${formatNumber(Number(counter) - last)} shots since the last reading` : undefined}>
          <input type="number" min={last} className="input" value={counter} onChange={(event) => setCounter(event.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <Field label="Stopped because">
            <select className="input" value={stop.reason} onChange={(event) => setStop({ ...stop, reason: event.target.value })}>
              <option value="">No stop</option>
              {reasons.downtime.map((option) => <option key={option.key} value={option.key}>{option.label}{option.planned ? ' (planned)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Minutes"><input type="number" min={0} className="input" value={stop.minutes} onChange={(event) => setStop({ ...stop, minutes: event.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <Field label="Rejects for">
            <select className="input" value={defect.reason} onChange={(event) => setDefect({ ...defect, reason: event.target.value })}>
              <option value="">No rejects</option>
              {reasons.rejects.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Pieces"><input type="number" min={0} className="input" value={defect.pieces} onChange={(event) => setDefect({ ...defect, pieces: event.target.value })} /></Field>
        </div>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !something}>{busy ? 'Saving…' : 'Log it'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MouldRuns() {
  const { canWrite } = useAuth();
  const mayRun = canWrite('production');
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  /* Opened from a Production task (Start a run): the dialog opens with the enquiry and its SO. */
  const [params, setParams] = useSearchParams();
  const fromTask = params.get('start') ? { enquiry: params.get('enquiry') || '', order: params.get('order') || '', label: params.get('label') || undefined, workOrder: params.get('workOrder') || undefined } : null;
  const [starting, setStarting] = useState(Boolean(fromTask));
  const [finishing, setFinishing] = useState(null);
  const [logging, setLogging] = useState(null);
  const load = useCallback(() => mouldRunsApi.list({ limit: 150 }).then((rows) => { setRuns(rows); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const running = (runs || []).filter((run) => run.status === 'running');
  const ended = (runs || []).filter((run) => run.status !== 'running');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mould runs"
        subtitle="Which mould is on which machine, for which order — and what each run gave."
        actions={(
          <>
            <Link to="/machines" className="btn-secondary">Machines</Link>
            {mayRun && <button type="button" className="btn-primary" onClick={() => setStarting(true)}>Start a run</button>}
          </>
        )}
      />
      {error && <ErrorState error={error} onRetry={load} />}
      {!runs && !error && <Spinner label="Loading runs" />}
      {runs && !runs.length && <EmptyState title="No runs yet" description={mayRun ? 'Press Start a run when a mould goes on a machine.' : 'Production records the runs.'} />}
      {running.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Running now">
          {running.map((run) => (
            <div key={run._id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-success-400">Running · {elapsed(run.startedAt)}</p>
                  <p className="mt-1 text-base font-bold text-steel-50">{run.mould?.mouldCode}{run.machine ? <span className="font-normal text-steel-400"> on {run.machine.code}</span> : null}</p>
                  <p className="text-sm text-steel-300">{run.customer?.name || 'Stock'}{run.enquiry?.number ? ` · ${run.enquiry.number}` : ''}</p>
                  <p className="mt-1 text-xs text-steel-500">{[run.number, run.colour, run.plannedQuantity && `${formatNumber(run.plannedQuantity)} planned`, run.operator].filter(Boolean).join(' · ')}</p>
                  {(run.counterLog?.length > 0 || run.downtimeMinutes > 0 || run.rejectedPieces > 0) && (
                    <p className="mt-1 text-xs text-steel-400">{[run.counterLog?.length && `Counter ${formatNumber(run.counterLog.at(-1).counter)}`, run.downtimeMinutes > 0 && `${formatNumber(run.downtimeMinutes)} min stopped`, run.rejectedPieces > 0 && `${formatNumber(run.rejectedPieces)} rejects`].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                {mayRun && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button type="button" className="btn-secondary" onClick={() => setLogging(run)}>Log</button>
                    <button type="button" className="btn-secondary" onClick={() => setFinishing(run)}>Finish</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {ended.length > 0 && (
        <Section title="Ended runs">
          <RunsTable rows={ended} showMould showMachine empty="" />
        </Section>
      )}
      {starting && (
        <StartRun
          initial={fromTask || {}}
          onClose={() => { setStarting(false); if (fromTask) setParams({}, { replace: true }); }}
          onStarted={load}
        />
      )}
      {finishing && <FinishRun run={finishing} onClose={() => setFinishing(null)} onFinished={load} />}
      {logging && <LogRun run={logging} onClose={() => setLogging(null)} onLogged={load} />}
    </div>
  );
}
