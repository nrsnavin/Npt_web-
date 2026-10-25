import { useCallback, useEffect, useState } from 'react';
import { production as productionApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import PressChoices from './PressChoices.jsx';
import { formatNumber } from '../utils/format.js';
import { shortDay } from '../utils/planningBoard.js';

/**
 * The press step on a Production task — production floor planning only [server:
 * floorPlanning.service `taskPlan`; Admin's switch]. Each routed model with its work order: on a
 * press (which, its place in the queue, from when to when, how far its runs have got) or not yet,
 * with its best press one tap away. The plan ending after the day moulding must be done by — the
 * hand-over to Printing or Assembly, or the completion — is said in red. Off, nothing is drawn and
 * the task runs as it always has.
 */

const SETUP = [['mouldOff', 'Mould off'], ['mouldOn', 'Mould on'], ['heated', 'Heated'], ['firstPiece', 'First piece OK']];
const routeWords = (route) => ['Moulding', route?.printing && 'Printing', route?.assembly && 'Assembly'].filter(Boolean).join(' → ');

function ModelPress({ row, mayPlan, busy, onPlace, onChoose }) {
  const wo = row.workOrder;
  if (!wo) return null;
  const running = ['running', 'paused'].includes(wo.status);
  const setupDone = SETUP.filter(([key]) => wo.setup?.[key]?.at).length;
  return (
    <li className="rounded-xl border border-line/[0.08] bg-line/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-steel-50">{row.model} <span className="font-normal text-steel-400">· {routeWords(row.route)}</span></p>
          <p className="text-xs text-steel-500">{wo.number} · {formatNumber(wo.quantity)} pcs{wo.dueDay ? ` · moulding due ${shortDay(wo.dueDay)}` : ''}</p>
        </div>
        {wo.machine && mayPlan && !running && wo.status !== 'completed' && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onChoose(row)}>Move</button>
        )}
      </div>

      {wo.machine ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-sm text-steel-200">
            <span className="font-semibold text-steel-50">{running ? 'Running on' : wo.status === 'completed' ? 'Made on' : 'On'} {wo.machine.code}</span>
            {!running && wo.status !== 'completed' && wo.sequence ? <span className="text-steel-400"> · #{wo.sequence} in its queue</span> : null}
            {wo.plannedStart ? <span className="text-steel-400"> · {shortDay(wo.plannedStart)} to {shortDay(wo.plannedEnd)}</span> : null}
          </p>
          {wo.late && <p className="text-xs font-semibold text-danger-400">The plan ends {shortDay(wo.plannedEnd)} — after moulding is due ({shortDay(wo.dueDay)}). Move it, or change the date.</p>}
          {(running || wo.goodQty > 0) && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/[0.08]" role="progressbar" aria-valuenow={wo.madePercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.model} made`}>
                <div className="h-1.5 rounded-full bg-success-500" style={{ width: `${wo.madePercent}%` }} />
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-steel-400">{formatNumber(wo.goodQty)} of {formatNumber(wo.quantity)} · {wo.madePercent}%</p>
            </div>
          )}
          {!running && wo.status !== 'completed' && (
            <p className="text-xs text-steel-400">Mould change on the floor tablet: {setupDone === SETUP.length ? <span className="font-semibold text-success-400">first piece approved</span> : `${setupDone} of ${SETUP.length} done`}</p>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {wo.mouldMissing && <p className="text-xs font-semibold text-warn-400">No mould on record for {row.model} — add it to the mould register to plan it.</p>}
          {row.best?.machine && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${row.best.late ? 'bg-warn-500/[0.08]' : 'bg-success-500/[0.08]'}`}>
              <p className="text-xs text-steel-200" title={row.best.summary}>
                <span className={row.best.late ? 'text-warn-400' : 'text-success-400'} aria-hidden="true">★ </span>
                Not on a press · Best: <span className="font-bold text-steel-50">{row.best.machine.code}</span>
                <span className="text-steel-400"> · done {shortDay(row.best.end)}{row.best.late ? ' · late' : ''}</span>
              </p>
              {mayPlan && (
                <div className="flex gap-1.5">
                  <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onChoose(row)}>Choose press</button>
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onPlace(row, row.best.machine)}>Put on {row.best.machine.code}</button>
                </div>
              )}
            </div>
          )}
          {row.best && !row.best.machine && <p className="text-xs font-semibold text-danger-400">✗ No press can take it — {row.best.why}</p>}
          {!row.best && !wo.mouldMissing && <p className="text-xs text-steel-400">Not on a press yet.</p>}
        </div>
      )}
    </li>
  );
}

export default function TaskPressPlan({ todo, mayPlan, onChanged }) {
  const { toast, warn } = useToast();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(null);
  const [ranked, setRanked] = useState(null);
  const load = useCallback(() => productionApi.taskPlan(todo._id).then(setPlan).catch(() => setPlan({ on: false, models: [] })), [todo._id]);
  useEffect(() => { load(); }, [load, todo.updatedAt]);
  useEffect(() => {
    if (!choosing?.workOrder) return undefined;
    let live = true;
    setRanked(null);
    productionApi.choices(choosing.workOrder._id).then((value) => live && setRanked(value)).catch((failure) => live && setRanked({ sized: false, why: failure.message }));
    return () => { live = false; };
  }, [choosing]);

  /* Off, or nothing routed yet: the task runs as it always has. */
  if (!plan?.on || !plan.models?.length) return null;
  const place = async (row, machine) => {
    setBusy(true);
    try {
      setPlan(await productionApi.placeTaskModel({ taskId: todo._id, model: row.model, machine: machine._id }));
      toast(`${row.model} on ${machine.code}`, 'It reads Planning on the task; the floor sees it in the press’s queue.');
      setChoosing(null);
      onChanged?.();
    } catch (failure) {
      warn(`${row.model} not planned`, failure.message);
    } finally {
      setBusy(false);
    }
  };
  const waiting = plan.models.filter((row) => row.workOrder && !row.workOrder.machine).length;
  return (
    <section aria-label="Presses" className="rounded-xl border border-accent/30 bg-accent/[0.04] p-3">
      <p className="text-sm font-semibold text-steel-100">
        Presses <span className="font-normal text-steel-400">· {waiting ? `${waiting} model${waiting === 1 ? '' : 's'} not on a press yet` : 'every model planned'}</span>
      </p>
      <ul className="mt-2 space-y-2">
        {plan.models.map((row) => (
          <ModelPress key={row.model} row={row} mayPlan={mayPlan} busy={busy} onPlace={place} onChoose={setChoosing} />
        ))}
      </ul>
      {!mayPlan && <p className="mt-2 text-xs text-steel-400">The Production in charge plans the presses — you see where each model runs.</p>}
      {choosing && (
        <Modal open title={`Which press for ${choosing.model}?`} description={`${choosing.workOrder.number} · best first, with the reasons`} onClose={() => setChoosing(null)} size="lg">
          {!ranked && <Spinner label="Scoring the presses" />}
          <PressChoices result={ranked} currentPressId={choosing.workOrder.machine?._id} busy={busy} onPick={(choice) => place(choosing, choice.machine)} />
        </Modal>
      )}
    </section>
  );
}
