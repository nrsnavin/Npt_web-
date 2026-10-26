import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi, workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ErrorState, Field, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import PressChoices from '../components/PressChoices.jsx';
import { formatNumber } from '../utils/format.js';

/**
 * Today on the presses [server: pressDay.service] — the start of the shift in one list. Every
 * press: what runs on it, the job planned next and whether its start has come. One tap each:
 *
 *   Confirm running   the run starts on the press — the Production task reads Started
 *   Not today         the start is held till tomorrow, with why (the in charge's call)
 *   Move              another press, best first [PressChoices]
 *
 * Above them, where the task and the floor disagree, each with the tap that puts them together;
 * and the shift change — the counter on every running press, and the pieces made, at once.
 */

const when = (at) => new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const since = (at) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at)) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
const jobWords = (task) => [task?.enquiry, task?.customer].filter(Boolean).join(' · ');
const FIX_LABEL = { confirm: 'Confirm running', said_started: 'Mark Production Started', call_in: 'Call in the press' };
const FIX_MOVE = { confirm: 'confirm', said_started: 'said-started', call_in: 'call-in' };

function StatePill({ press }) {
  const [tone, words] = press.calledIn ? ['bg-danger-500/15 text-danger-400 ring-danger-500/30', 'Called in']
    : press.running ? ['bg-success-500/15 text-success-400 ring-success-500/30', 'Running']
      : press.next?.held ? ['bg-line/[0.06] text-steel-300 ring-line/[0.12]', 'Held till tomorrow']
        : press.next?.due ? ['bg-warn-500/15 text-warn-400 ring-warn-500/30', 'Due to start']
          : ['bg-line/[0.06] text-steel-400 ring-line/[0.12]', press.next ? 'Planned' : 'Free'];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>{words}</span>;
}

/** Confirm running: the counter now, if it is read. */
function ConfirmDialog({ press, onClose, onDone }) {
  const [counter, setCounter] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onDone(await productionApi.pressDayMove({ id: press.next.workOrder._id, move: 'confirm', ...(counter !== '' ? { counterStart: Number(counter) } : {}) }));
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Confirm ${press.next.model || press.next.workOrder.number} is running on ${press.code}`} description="The run starts on the press now; the Production task reads Started." onClose={onClose}>
      <div className="space-y-3">
        <Field label="Counter on the press now" hint="Leave blank if it is not read">
          <input type="number" min={0} inputMode="numeric" className="input" value={counter} onChange={(event) => setCounter(event.target.value)} autoFocus />
        </Field>
        {!press.next.workOrder.firstPiece && <p className="text-xs text-steel-400">The first piece is not approved on the floor checklist — the run starts with that said.</p>}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Starting…' : `Confirm running on ${press.code}`}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Not today: why — the in charge is not asked again till tomorrow. */
function HoldDialog({ press, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onDone(await productionApi.pressDayMove({ id: press.next.workOrder._id, move: 'hold', reason: reason.trim() }));
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title={`${press.next.model || press.next.workOrder.number} does not start today`} description={`On ${press.code}. Held till tomorrow — you are not asked again before then.`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Why" required>
          <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mould at the tool room, material not in…" autoFocus />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || reason.trim().length < 3}>Hold till tomorrow</button>
        </div>
      </div>
    </Modal>
  );
}

/** Move: every press ranked for the job, best first; the pick re-plans it. */
function MoveDialog({ press, onClose, onDone }) {
  const [ranked, setRanked] = useState(null);
  const [busy, setBusy] = useState(false);
  const wo = press.next.workOrder;
  useEffect(() => {
    let live = true;
    productionApi.choices(wo._id).then((value) => live && setRanked(value)).catch((failure) => live && setRanked({ sized: false, why: failure.message }));
    return () => { live = false; };
  }, [wo._id]);
  const pick = async (choice) => {
    setBusy(true);
    try {
      await workOrdersApi.plan({ id: wo._id, machine: choice.machine._id });
      onDone({ lines: [`${press.next.model || wo.number} moved to ${choice.machine.code}`] });
    } catch (failure) {
      setRanked((current) => ({ ...current, problem: failure.message }));
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Which press for ${press.next.model || wo.number}?`} description={`${wo.number} · now on ${press.code} · best first, with the reasons`} onClose={onClose} size="lg">
      {!ranked && <Spinner label="Scoring the presses" />}
      {ranked?.problem && <Notice tone="danger">{ranked.problem}</Notice>}
      <PressChoices result={ranked} currentPressId={press._id} busy={busy} onPick={pick} />
    </Modal>
  );
}

/** The shift change: on each running press the counter now and the pieces made since the last log. */
function ShiftDialog({ presses, onClose, onDone }) {
  const running = presses.filter((press) => press.running);
  const [shift, setShift] = useState('A');
  const [rows, setRows] = useState(() => Object.fromEntries(running.map((press) => [press.running._id, { counter: '', good: '', rejected: '' }])));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (id, field, value) => setRows((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  const readings = running.map((press) => ({ press, row: rows[press.running._id] }))
    .filter(({ row }) => row.counter !== '' || row.good !== '')
    .map(({ press, row }) => ({
      run: press.running._id,
      ...(row.counter !== '' ? { counter: Number(row.counter) } : {}),
      ...(row.good !== '' ? { goodPieces: Number(row.good), rejectedPieces: Number(row.rejected) || 0 } : {}),
    }));
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onDone(await productionApi.shiftReadings({ shift, readings }));
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title="Shift change" description="The counter on each running press now. Give the good pieces too and the run ends with them — the press goes on with the rest on a fresh run." onClose={onClose} size="lg">
      <div className="space-y-3">
        <Field label="Shift ending">
          <select className="input w-40" value={shift} onChange={(event) => setShift(event.target.value)}>
            {['A', 'B', 'C', 'General'].map((key) => <option key={key} value={key}>{key === 'General' ? 'General' : `Shift ${key}`}</option>)}
          </select>
        </Field>
        {!running.length && <p className="text-sm text-steel-400">Nothing is running on the presses.</p>}
        <ul className="divide-y divide-line/[0.06]" aria-label="Running presses">
          {running.map((press) => {
            const row = rows[press.running._id];
            const shots = row.counter !== '' && press.running.lastCounter != null ? Number(row.counter) - press.running.lastCounter : null;
            const estimate = shots != null && shots >= 0 ? shots * (press.running.cavities || 1) : null;
            return (
              <li key={press._id} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-steel-50">{press.code}</span>
                  <span className="text-steel-300"> · {press.running.model} · {press.running.number}</span>
                  <span className="block text-xs text-steel-400">Last counter {press.running.lastCounter != null ? formatNumber(press.running.lastCounter) : '—'}{estimate != null ? ` · ≈ ${formatNumber(estimate)} pieces since (${press.running.cavities} cavities)` : ''}</span>
                </span>
                <input type="number" min={0} inputMode="numeric" aria-label={`Counter now on ${press.code}`} placeholder="Counter now" className="input w-32 py-1.5" value={row.counter} onChange={(event) => set(press.running._id, 'counter', event.target.value)} />
                <input type="number" min={0} inputMode="numeric" aria-label={`Good pieces on ${press.code}`} placeholder={estimate != null ? `Good ≈ ${estimate}` : 'Good pieces'} className="input w-32 py-1.5" value={row.good} onChange={(event) => set(press.running._id, 'good', event.target.value)} />
                <input type="number" min={0} inputMode="numeric" aria-label={`Rejected pieces on ${press.code}`} placeholder="Rejected" className="input w-28 py-1.5" value={row.rejected} onChange={(event) => set(press.running._id, 'rejected', event.target.value)} disabled={row.good === ''} />
              </li>
            );
          })}
        </ul>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !readings.length}>{busy ? 'Saving…' : readings.length ? `Save ${readings.length} reading${readings.length === 1 ? '' : 's'}` : 'Save readings'}</button>
        </div>
      </div>
    </Modal>
  );
}

function PressCard({ press, mayWork, mayPlan, onOpen }) {
  const { running, next } = press;
  return (
    <li className={`rounded-xl border p-3 ${press.calledIn ? 'border-danger-500/40' : next?.due && !running && !next.held ? 'border-warn-500/40 bg-warn-500/[0.04]' : 'border-line/[0.08]'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-steel-50">{press.code}{press.tonnage ? <span className="ml-1 text-xs font-normal text-steel-400">{press.tonnage} T</span> : null}</p>
        <StatePill press={press} />
      </div>
      {press.calledIn && <p className="mt-1 text-xs text-danger-400">Called in {when(press.calledIn.at)}{press.calledIn.note ? ` — ${press.calledIn.note}` : ''}</p>}
      {running && (
        <div className="mt-2 text-sm">
          <p className="text-steel-100"><span className="font-semibold">{running.model}</span> · {running.number} · {since(running.startedAt)}</p>
          {running.workOrder && <p className="text-xs tabular-nums text-steel-400">{formatNumber(running.workOrder.goodQty)} of {formatNumber(running.workOrder.quantity)} made{running.lastCounter != null ? ` · counter ${formatNumber(running.lastCounter)}` : ''}</p>}
          {running.task && <p className="text-xs text-steel-400"><Link to={`/production/workflow/${running.task._id}`} className="hover:text-accent">{jobWords(running.task) || 'The task'}</Link></p>}
        </div>
      )}
      {next && (
        <div className={`mt-2 text-sm ${running ? 'border-t border-line/[0.06] pt-2' : ''}`}>
          <p className="text-steel-100">{running ? 'Then ' : 'Next '}<span className="font-semibold">{next.model || next.workOrder.number}</span> · {formatNumber(next.workOrder.quantity - next.workOrder.goodQty)} pcs</p>
          <p className="text-xs text-steel-400">
            {next.workOrder.plannedStart ? `Planned from ${when(next.workOrder.plannedStart)}` : 'No start planned'}
            {next.task ? <> · <Link to={`/production/workflow/${next.task._id}`} className="hover:text-accent">{jobWords(next.task) || 'the task'}</Link></> : null}
          </p>
          {next.held && <p className="text-xs text-steel-300">Not today{next.held.reason ? ` — ${next.held.reason}` : ''}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mayWork && !running && !press.calledIn && (
              <button type="button" className={next.due && !next.held ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'} onClick={() => onOpen('confirm', press)}>
                {next.due ? 'Confirm running' : 'Start now'}
              </button>
            )}
            {mayPlan && next.due && !next.held && !running && <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => onOpen('hold', press)}>Not today</button>}
            {mayPlan && <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => onOpen('move', press)}>Move</button>}
          </div>
        </div>
      )}
      {!running && !next && !press.calledIn && <p className="mt-2 text-xs text-steel-500">Nothing planned — put a job on it from the planning board.</p>}
      {press.queued > 1 && <p className="mt-1 text-xs text-steel-500">{press.queued - 1} more in its queue</p>}
    </li>
  );
}

export default function PressDay() {
  const { canWrite, mayPlanProduction, isAdmin } = useAuth();
  const { toast, warn } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => productionApi.pressDay().then((value) => { setData(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const mayWork = canWrite('production');
  const mayPlan = Boolean(mayPlanProduction || isAdmin);
  const done = (title) => (answer) => {
    setOpen(null);
    toast(title, (answer?.lines || []).join(' · '));
    load();
  };
  const fix = async (row) => {
    setBusy(row.workOrder._id);
    try {
      done(FIX_LABEL[row.fix])(await productionApi.pressDayMove({ id: row.workOrder._id, move: FIX_MOVE[row.fix] }));
    } catch (failure) {
      warn('Not done', failure.message);
    } finally {
      setBusy(null);
    }
  };
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner label="Reading the presses" />;
  const due = data.presses.filter((press) => press.next?.due && !press.next.held && !press.running && !press.calledIn).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Today on the presses"
        subtitle={`${new Date(`${data.day}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · ${data.presses.filter((press) => press.running).length} running · ${due} due to start`}
        actions={(
          <div className="flex flex-wrap gap-2">
            {mayWork && <button type="button" className="btn-primary" onClick={() => setOpen({ kind: 'shift' })}>Shift change</button>}
            <Link to="/production/plan" className="btn-secondary">Planning board</Link>
            <Link to="/floor" className="btn-secondary">Floor</Link>
          </div>
        )}
      />
      {!data.on && <Notice tone="info">Floor planning is off — Production tasks are not planned on presses, so nothing here is due. Admin turns it on in Settings.</Notice>}

      {data.mismatches.length > 0 && (
        <section aria-label="The task and the floor disagree" className="space-y-2 rounded-xl border border-warn-500/40 bg-warn-500/[0.05] p-3">
          <h2 className="text-sm font-bold text-warn-400">The task and the floor disagree ({data.mismatches.length})</h2>
          <ul className="divide-y divide-line/[0.06]">
            {data.mismatches.map((row) => (
              <li key={`${row.workOrder._id}-${row.kind}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-steel-50">{row.model}</span>
                  <span className="text-steel-200"> — {row.words}</span>
                  {row.task && <span className="block text-xs text-steel-400"><Link to={`/production/workflow/${row.task._id}`} className="hover:text-accent">{jobWords(row.task) || 'Open the task'}</Link></span>}
                </span>
                {mayWork && row.fix && (
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy === row.workOrder._id} onClick={() => fix(row)}>
                    {row.fix === 'confirm' && row.press ? `Confirm running on ${row.press.code}` : row.fix === 'call_in' && row.press ? `Call in ${row.press.code}` : FIX_LABEL[row.fix]}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Presses">
        {data.presses.map((press) => (
          <PressCard key={press._id} press={press} mayWork={mayWork} mayPlan={mayPlan} onOpen={(kind, which) => setOpen({ kind, press: which })} />
        ))}
      </ul>
      {!data.presses.length && <p className="text-sm text-steel-400">No presses on the register yet — add them on the Machines page.</p>}

      {open?.kind === 'confirm' && <ConfirmDialog press={open.press} onClose={() => setOpen(null)} onDone={done('Running')} />}
      {open?.kind === 'hold' && <HoldDialog press={open.press} onClose={() => setOpen(null)} onDone={done('Not today')} />}
      {open?.kind === 'move' && <MoveDialog press={open.press} onClose={() => setOpen(null)} onDone={done('Moved')} />}
      {open?.kind === 'shift' && <ShiftDialog presses={data.presses} onClose={() => setOpen(null)} onDone={done('Shift change logged')} />}
    </div>
  );
}
