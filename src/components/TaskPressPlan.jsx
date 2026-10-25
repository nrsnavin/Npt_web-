import { useCallback, useEffect, useState } from 'react';
import { production as productionApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import PressChoices from './PressChoices.jsx';
import { formatNumber } from '../utils/format.js';
import { shortDay } from '../utils/planningBoard.js';
import { SETUP_KEYS, afterMoulding, lateWords, modelPress, pressAttention, setupDone } from '../utils/floorPlanning.js';

/**
 * The press step on a Production task — production floor planning only [server: floorPlanning.service
 * `taskPlan`; Admin's switch]. One quiet line per routed model: its pieces, the day moulding is due,
 * and a pill for where it stands. Only what needs the Production in charge is coloured — a model
 * with no press (amber), a plan ending after moulding is due or a mould no press can take (red) —
 * and only the in charge sees the buttons that plan it. Off, nothing is drawn.
 */

const PILL = {
  warn: 'bg-warn-500/15 text-warn-400 ring-warn-500/30',
  danger: 'bg-danger-500/15 text-danger-400 ring-danger-500/30',
  success: 'bg-success-500/15 text-success-400 ring-success-500/30',
  neutral: 'bg-line/[0.06] text-steel-200 ring-line/[0.12]',
};
const BAR = { warn: 'bg-warn-400', danger: 'bg-danger-400' };

function Pill({ tone, children }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${PILL[tone] || PILL.neutral}`}>{children}</span>;
}

function ModelRow({ row, mayPlan, busy, onPlace, onChoose }) {
  const wo = row.workOrder;
  const state = modelPress(row);
  if (!state) return null;
  const onPress = Boolean(wo.machine) && !['running', 'paused', 'completed'].includes(wo.status);
  const running = ['running', 'paused'].includes(wo.status);
  const done = setupDone(wo);
  const late = lateWords(wo);
  return (
    <li className="relative py-3 pl-4 pr-1">
      {BAR[state.tone] && <span aria-hidden="true" className={`absolute inset-y-3 left-0 w-1 rounded-full ${BAR[state.tone]}`} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="font-semibold text-steel-50">{row.model}</span>
            <span className="truncate text-xs text-steel-500">→ {afterMoulding(row.route)}</span>
          </p>
          <p className="text-xs tabular-nums text-steel-400">
            {wo.quantity ? `${formatNumber(wo.quantity)} pcs` : 'Pieces not known yet'}
            {wo.dueDay ? <> · moulding due <span className="text-steel-200">{shortDay(wo.dueDay)}</span></> : null}
            {onPress && wo.plannedStart ? ` · ${shortDay(wo.plannedStart)} – ${shortDay(wo.plannedEnd)}` : ''}
          </p>
        </div>

        <Pill tone={state.tone}>
          {state.key === 'running' && <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-400" />}
          {state.words}
          {onPress && wo.sequence ? <span className="font-normal opacity-70">#{wo.sequence}</span> : null}
        </Pill>

        {mayPlan && state.key === 'waiting' && row.best?.machine && (
          <div className="flex items-center gap-1">
            <button type="button" className="row-action px-2 py-1 text-xs" disabled={busy} onClick={() => onChoose(row)}>Other press</button>
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onPlace(row, row.best.machine)} title={row.best.summary}>
              Put on {row.best.machine.code}
            </button>
          </div>
        )}
        {mayPlan && onPress && (
          <button type="button" className="row-action px-2 py-1 text-xs" disabled={busy} onClick={() => onChoose(row)}>Move</button>
        )}
      </div>

      {/* One line under the row, only when it says something. */}
      {state.key === 'waiting' && row.best?.machine && (
        <p className="mt-1 text-xs text-steel-500">Best press {row.best.machine.code}, done {shortDay(row.best.end)}{row.best.late ? <span className="font-semibold text-warn-400"> · late even there</span> : ''}</p>
      )}
      {state.key === 'blocked' && (
        <p className="mt-1 text-xs text-danger-400">{wo.mouldMissing ? `Add ${row.model} to the mould register to plan it.` : row.best?.why}</p>
      )}
      {late && <p className="mt-1 text-xs font-semibold text-danger-400">{late}</p>}
      {running && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line/[0.08]" role="progressbar" aria-valuenow={wo.madePercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.model} made`}>
            <div className="h-1 rounded-full bg-success-500 transition-[width] duration-500" style={{ width: `${wo.madePercent}%` }} />
          </div>
          <span className="text-xs tabular-nums text-steel-400">{formatNumber(wo.goodQty)} / {formatNumber(wo.quantity)}</span>
        </div>
      )}
      {onPress && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-steel-500" aria-label={`Mould change ${done} of ${SETUP_KEYS.length} done`}>
          <span className="flex gap-0.5" aria-hidden="true">
            {SETUP_KEYS.map((key, index) => <span key={key} className={`h-1.5 w-3 rounded-full ${index < done ? 'bg-success-400' : 'bg-line/[0.14]'}`} />)}
          </span>
          {done === SETUP_KEYS.length ? 'First piece approved' : `Mould change ${done}/${SETUP_KEYS.length} on the floor`}
        </p>
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
  const needs = pressAttention(plan.models);
  const calm = !needs.waiting && !needs.blocked && !needs.late;
  return (
    <section aria-label="Presses" className="rounded-xl border border-line/[0.08] bg-line/[0.02] px-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-steel-100">Presses</p>
        <div className="flex flex-wrap gap-1.5" aria-label="Needs attention">
          {needs.waiting > 0 && <Pill tone="warn">{needs.waiting} need{needs.waiting === 1 ? 's' : ''} a press</Pill>}
          {needs.late > 0 && <Pill tone="danger">{needs.late} late</Pill>}
          {needs.blocked > 0 && <Pill tone="danger">{needs.blocked} can’t be placed</Pill>}
          {calm && <Pill tone="success">✓ All on presses</Pill>}
        </div>
      </div>
      <ul className="mt-1 divide-y divide-line/[0.06]">
        {plan.models.map((row) => (
          <ModelRow key={row.model} row={row} mayPlan={mayPlan} busy={busy} onPlace={place} onChoose={setChoosing} />
        ))}
      </ul>
      {!mayPlan && <p className="border-t border-line/[0.06] py-2 text-xs text-steel-500">Planned by the Production in charge.</p>}
      {choosing && (
        <Modal open title={`Which press for ${choosing.model}?`} description={`${choosing.workOrder.number} · best first, with the reasons`} onClose={() => setChoosing(null)} size="lg">
          {!ranked && <Spinner label="Scoring the presses" />}
          <PressChoices result={ranked} currentPressId={choosing.workOrder.machine?._id} busy={busy} onPick={(choice) => place(choosing, choice.machine)} />
        </Modal>
      )}
    </section>
  );
}
