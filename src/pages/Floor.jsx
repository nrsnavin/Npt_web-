import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { machinesApi, production as productionApi, workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ErrorState, Field, FormError, Modal, Spinner } from '../components/ui.jsx';
import { useRunReasons } from '../components/RunReasons.jsx';
import { FinishRun, LogRun, StartRun } from './MouldRuns.jsx';
import { formatDate, formatNumber } from '../utils/format.js';

const elapsed = (from) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(from)) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/** Calling a breakdown: the reason in one tap, a note if there is one. */
function AndonDialog({ machine, onClose, onDone }) {
  const reasons = useRunReasons();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await machinesApi.andon({ id: machine._id, reason, note: note.trim() || undefined });
      onDone(`${machine.code} called in`, 'Production and Admin are told now.');
      onClose();
    } catch (failure) {
      setProblem(failure);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${machine.code} has stopped`} description="Pick why. The team gets an alert at once.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {reasons.downtime.filter((option) => !option.planned).map((option) => (
            <button key={option.key} type="button" onClick={() => setReason(option.key)} className={`rounded-xl border px-3 py-4 text-left text-sm font-semibold ${reason === option.key ? 'border-danger-500 bg-danger-500/15 text-danger-300' : 'border-line/[0.1] text-steel-100'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <Field label="What you see"><input className="input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Zone 3 not heating, ejector stuck…" /></Field>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary bg-danger-600" disabled={busy || !reason} onClick={save}>{busy ? 'Calling…' : 'Call it in'}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Marking the press running again: what was done goes on its breakdown record. */
function ClearDialog({ machine, onClose, onDone }) {
  const [workDone, setWorkDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await machinesApi.clearAndon({ id: machine._id, workDone: workDone.trim() || undefined });
      onDone(`${machine.code} running again`, `${answer.minutes} min stopped${answer.run ? `, put on ${answer.run}` : ''}.`);
      onClose();
    } catch (failure) {
      setProblem(failure);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${machine.code} is running again`} description="The stop goes on the running job and a breakdown record is written.">
      <div className="space-y-4">
        <Field label="What was done"><textarea className="input" rows={2} value={workDone} onChange={(event) => setWorkDone(event.target.value)} maxLength={2000} placeholder="Heater band replaced" autoFocus /></Field>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Running again'}</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The floor tablet [server: floor.service `floorView`]: one big tile per press — what is running,
 * for how long, the counter and what has been stopped or rejected — with the four things an
 * operator does all shift a tap away: log the counter, a stop or rejects; finish the job; start
 * the next one; or call a breakdown. A job card's QR code opens this page on its job.
 */
export default function Floor() {
  const { canWrite } = useAuth();
  const mayRun = canWrite('production');
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [tiles, setTiles] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => productionApi.floor().then((rows) => { setTiles(rows); setError(null); }).catch(setError), []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  /* Opened from a job card's QR code: start that job, or show it running. */
  const scanned = params.get('wo');
  useEffect(() => {
    if (!scanned || !tiles || dialog) return;
    const running = tiles.find((tile) => String(tile.run?.workOrder?._id) === scanned);
    if (running) setDialog({ kind: 'log', run: running.run });
    else if (mayRun) setDialog({ kind: 'start', workOrder: scanned });
    setParams({}, { replace: true });
  }, [scanned, tiles, dialog, mayRun, setParams]);
  const done = (title, detail) => { toast(title, detail); load(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-steel-50">Floor</h1>
          <p className="text-sm text-steel-400">Every press, what is on it, and the next job. Updates every 30 seconds.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/production/shift" className="btn-secondary">Shift handover</Link>
          <Link to="/production/plan" className="btn-secondary">Planning board</Link>
        </div>
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!tiles && !error && <Spinner label="Loading the floor" />}
      {tiles && tiles.length === 0 && <p className="text-sm text-steel-500">No presses yet. Add them on the Machines page.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(tiles || []).map(({ machine, run, next }) => {
          const down = machine.andon?.open;
          const lastCounter = run ? (run.counterLog?.at(-1)?.counter ?? run.counterStart ?? 0) : null;
          return (
            <section key={machine._id} aria-label={machine.code} className={`card space-y-3 p-4 ${down ? 'ring-2 ring-danger-500' : run ? 'ring-1 ring-success-500/50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-extrabold text-steel-50">{machine.code}<span className="ml-2 text-sm font-normal text-steel-400">{machine.tonnage ? `${machine.tonnage} T` : ''}</span></p>
                  <p className={`text-sm font-semibold ${down ? 'text-danger-400' : run ? 'text-success-400' : 'text-steel-400'}`}>
                    {down ? `Stopped since ${elapsed(machine.andon.at)}${machine.andon.note ? ` — ${machine.andon.note}` : ''}` : run ? `Running · ${elapsed(run.startedAt)}` : 'Idle'}
                  </p>
                </div>
                {mayRun && (down
                  ? <button type="button" className="btn-primary px-4 py-3" onClick={() => setDialog({ kind: 'clear', machine })}>Running again</button>
                  : <button type="button" className="rounded-xl bg-danger-600 px-4 py-3 text-sm font-bold text-white" onClick={() => setDialog({ kind: 'andon', machine })}>Breakdown</button>)}
              </div>
              {run ? (
                <div className="rounded-xl bg-line/[0.04] p-3">
                  <p className="text-lg font-bold text-steel-50">{run.mould?.mouldCode}{run.workOrder?.colour ? ` · ${run.workOrder.colour}` : ''}</p>
                  <p className="text-sm text-steel-300">{[run.customer?.name, run.workOrder?.number, run.number].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-sm text-steel-300">Counter {formatNumber(lastCounter)}{run.downtimeMinutes ? ` · ${formatNumber(run.downtimeMinutes)} min stopped` : ''}{run.rejectedPieces ? ` · ${formatNumber(run.rejectedPieces)} rejects` : ''}</p>
                  {run.workOrder && <p className="text-xs text-steel-500">{formatNumber(Math.max(0, (run.workOrder.quantity || 0) - (run.workOrder.goodQty || 0)))} still to make on the work order</p>}
                  {mayRun && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" className="btn-secondary py-3 text-base" onClick={() => setDialog({ kind: 'log', run })}>Log</button>
                      <button type="button" className="btn-primary py-3 text-base" onClick={() => setDialog({ kind: 'finish', run })}>Finish</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {next.length === 0 && <p className="text-sm text-steel-500">Nothing planned on this press.</p>}
                  {next.map((job, index) => (
                    <div key={job._id} className="flex items-center justify-between gap-2 rounded-xl bg-line/[0.04] px-3 py-2">
                      <div>
                        <p className="font-semibold text-steel-100">{index === 0 ? 'Next: ' : ''}{job.mould || job.number}{job.colour ? ` · ${job.colour}` : ''}</p>
                        <p className="text-xs text-steel-400">{job.number} · {formatNumber(job.left)} pcs{job.dueDate ? ` · due ${formatDate(job.dueDate)}` : ''}</p>
                      </div>
                      {mayRun && index === 0 && !down && <button type="button" className="btn-primary px-4 py-3" onClick={() => setDialog({ kind: 'start', workOrder: job._id, machine: machine._id })}>Start</button>}
                      <button type="button" className="row-action" onClick={() => workOrdersApi.jobCard(job._id)}>Job card</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {dialog?.kind === 'andon' && <AndonDialog machine={dialog.machine} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'clear' && <ClearDialog machine={dialog.machine} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'log' && <LogRun run={dialog.run} onClose={() => setDialog(null)} onLogged={load} />}
      {dialog?.kind === 'finish' && <FinishRun run={dialog.run} onClose={() => setDialog(null)} onFinished={load} />}
      {dialog?.kind === 'start' && <StartRun initial={{ workOrder: dialog.workOrder }} onClose={() => setDialog(null)} onStarted={load} />}
    </div>
  );
}
