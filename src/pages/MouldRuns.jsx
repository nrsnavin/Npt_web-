import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mouldRunsApi, orders as ordersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorState, Field, FormError, Modal, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { EnquirySelect, MaterialSelect, MouldSelect } from '../components/pickers.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import { RunsTable } from '../components/RecordTables.jsx';
import { formatNumber } from '../utils/format.js';
import { SHIFTS } from '../utils/records.js';

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

function StartRun({ onClose, onStarted }) {
  const [values, setValues] = useState({ mould: '', machine: '', enquiry: '', order: '', orderLine: '', colour: '', plannedQuantity: '', shift: '', operator: '', counterStart: '', resinMaterial: '', resinName: '', resinBatch: '' });
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
        mould: values.mould,
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mould" required><MouldSelect value={values.mould} onChange={set('mould')} allowCreate={false} /></Field>
          <Field label="Machine"><MachineSelect value={values.machine} onChange={set('machine')} emptyLabel="Pick the machine…" /></Field>
          <Field label="For enquiry / order" className="sm:col-span-2"><EnquirySelect value={values.enquiry} onChange={(value) => setValues((current) => ({ ...current, enquiry: value, order: '', orderLine: '' }))} won emptyLabel="Stock run — no order" /></Field>
          {orders.length > 0 && (
            <Field label="Sales order" hint="Good pieces are added to the SO line when the run ends">
              <select className="input" value={values.order} onChange={(event) => setValues((current) => ({ ...current, order: event.target.value, orderLine: '' }))}>
                <option value="">{orders.length > 1 ? 'Pick the SO…' : orders[0].number}</option>
                {orders.length > 1 && orders.map((row) => <option key={row._id} value={row._id}>{row.number}</option>)}
              </select>
            </Field>
          )}
          {chosenOrder?.lines?.length > 1 && (
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
          <button type="submit" className="btn-primary" disabled={busy || !values.mould || needsOrder}>{busy ? 'Starting…' : 'Start the run'}</button>
        </div>
      </form>
    </Modal>
  );
}

function FinishRun({ run, onClose, onFinished }) {
  const [values, setValues] = useState({ counterEnd: '', goodPieces: '', rejectedPieces: '', usedKg: '', regrindKg: '', downtimeMinutes: '', downtimeReason: '', issues: '', aborted: false });
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
        downtimeMinutes: number(values.downtimeMinutes),
        downtimeReason: values.downtimeReason,
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
          <Field label="Minutes stopped"><input type="number" min={0} className="input" value={values.downtimeMinutes} onChange={set('downtimeMinutes')} /></Field>
        </div>
        <Field label="Why it stopped"><input className="input" value={values.downtimeReason} onChange={set('downtimeReason')} maxLength={300} placeholder="Heater band, power cut, mould stuck…" /></Field>
        <Field label="Problems seen"><textarea className="input" value={values.issues} onChange={set('issues')} maxLength={2000} /></Field>
        <label className="flex items-center gap-2 text-sm text-steel-200">
          <input type="checkbox" checked={values.aborted} onChange={set('aborted')} />
          Stopped before the planned quantity — taken off early
        </label>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || (shots != null && shots < 0)}>{busy ? 'Saving…' : 'Finish the run'}</button>
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
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(null);
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
                </div>
                {mayRun && <button type="button" className="btn-secondary shrink-0" onClick={() => setFinishing(run)}>Finish</button>}
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
      {starting && <StartRun onClose={() => setStarting(false)} onStarted={load} />}
      {finishing && <FinishRun run={finishing} onClose={() => setFinishing(null)} onFinished={load} />}
    </div>
  );
}
