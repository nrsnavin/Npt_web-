import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import PressChoices from './PressChoices.jsx';
import { formatNumber } from '../utils/format.js';
import { shortDay } from '../utils/planningBoard.js';
import { tradeDueLabel } from '../utils/trading.js';
import { SETUP_KEYS, afterMoulding, lateWords, modelPress, pressAttention, proposalWords, setupDone } from '../utils/floorPlanning.js';

/**
 * The press step on a Production task — production floor planning only [server: floorPlanning.service
 * `taskPlan`; Admin's switch]. One quiet line per routed model: its pieces, the day moulding is due,
 * and a pill for where it stands. Only what needs the Production in charge is coloured — a model
 * with no press (amber), a plan ending after moulding is due or a mould no press can take (red) —
 * and only the in charge sees the buttons that plan it. Off, nothing is drawn.
 *
 * Routing a model lands it here already proposed on a press by the auto-planner [server:
 * floorPlanning.service `proposeTaskPlan`], with why — what it learned from the in charge's own
 * choices among the reasons. The in charge confirms (one model, or all), or changes the press.
 *
 * On a press and not running yet: "Confirm running on IM-05" — the run starts there and the model
 * reads Started [server: pressDay.service `confirmStart`], the same as Today on the presses.
 */

const PILL = {
  warn: 'bg-warn-500/15 text-warn-400 ring-warn-500/30',
  danger: 'bg-danger-500/15 text-danger-400 ring-danger-500/30',
  success: 'bg-success-500/15 text-success-400 ring-success-500/30',
  neutral: 'bg-line/[0.06] text-steel-200 ring-line/[0.12]',
  info: 'bg-aqua-500/15 text-aqua-300 ring-aqua-500/30',
};
const BAR = { warn: 'bg-warn-400', danger: 'bg-danger-400', info: 'bg-aqua-400' };

function Pill({ tone, children }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${PILL[tone] || PILL.neutral}`}>{children}</span>;
}

/** A traded model: bought in, never on a press — where its supply stands, and the way to the Trading page. */
function TradedRow({ row, state }) {
  const line = row.traded;
  return (
    <li className="relative py-3 pl-4 pr-1">
      {BAR[state.tone] && <span aria-hidden="true" className={`absolute inset-y-3 left-0 w-1 rounded-full ${BAR[state.tone]}`} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="font-semibold text-steel-50">{row.model}</span>
            <span className="truncate text-xs text-steel-500">→ {afterMoulding(row.route).replace('Straight to dispatch', 'Dispatch')}</span>
          </p>
          <p className="text-xs tabular-nums text-steel-400">
            {line.quantity ? `${formatNumber(line.quantity)} pcs` : 'Pieces not known yet'}
            {line.dueDay ? <> · {tradeDueLabel(line)} <span className={line.late ? 'font-semibold text-danger-400' : 'text-steel-200'}>{shortDay(line.dueDay)}</span></> : null}
            {line.expectedDay && ['ordered', 'part_received'].includes(line.status) ? ` · expected ${shortDay(line.expectedDay)}` : ''}
          </p>
        </div>
        <Pill tone={state.tone}>{state.words}</Pill>
        <Link to="/production/trading" className="row-action px-2 py-1 text-xs">Traded items</Link>
      </div>
    </li>
  );
}

function ModelRow({ row, mayPlan, mayRun, busy, onPlace, onChoose, onConfirm, onRun }) {
  const wo = row.workOrder;
  const state = modelPress(row);
  if (!state) return null;
  if (state.key === 'traded') return <TradedRow row={row} state={state} />;
  const onPress = Boolean(wo.machine) && !['running', 'paused', 'completed'].includes(wo.status);
  const running = ['running', 'paused'].includes(wo.status);
  const done = setupDone(wo);
  const late = lateWords(wo);
  const proposal = state.key === 'proposed' ? wo.proposal : null;
  /* Its planned start has come and nothing runs it: the confirm is the row's one loud button. */
  const startDue = onPress && wo.plannedStart && new Date(wo.plannedStart) <= new Date();
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
        {mayPlan && proposal && (
          <div className="flex items-center gap-1">
            <button type="button" className="row-action px-2 py-1 text-xs" disabled={busy} onClick={() => onChoose(row)}>Change</button>
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onConfirm([row.model])}>Confirm</button>
          </div>
        )}
        {mayPlan && onPress && (
          <button type="button" className="row-action px-2 py-1 text-xs" disabled={busy} onClick={() => onChoose(row)}>Move</button>
        )}
        {mayRun && onPress && wo.machine?.code && (
          <button type="button" className={startDue ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'} disabled={busy} onClick={() => onRun(row)}>
            Confirm running on {wo.machine.code}
          </button>
        )}
      </div>

      {/* One line under the row, only when it says something. */}
      {proposal && (
        <div className="mt-1 space-y-0.5 text-xs">
          <p className={proposal.late ? 'font-semibold text-danger-400' : 'text-steel-400'} title={(proposal.reasons || []).map((reason) => reason.text).join('\n')}>{proposalWords(proposal, wo.dueDay)}</p>
          {proposal.learned?.[0] && <p className="text-aqua-300"><span aria-hidden="true">✦ </span>{proposal.learned[0]}</p>}
        </div>
      )}
      {state.key === 'waiting' && row.best?.machine && (
        <p className="mt-1 text-xs text-steel-500">Best press {row.best.machine.code}, done {shortDay(row.best.end)}{row.best.late ? <span className="font-semibold text-warn-400"> · late even there</span> : ''}</p>
      )}
      {wo.mouldDefaults && wo.mould && (
        <p className="mt-1 text-xs text-steel-500">
          Mould on plant default values — <Link to={`/moulds/${wo.mould}`} className="text-aqua-300 hover:underline">measure and correct it</Link> for true dates.
        </p>
      )}
      {state.key === 'blocked' && (
        <p className="mt-1 text-xs text-danger-400">{wo.mouldMissing ? `Add ${row.model} to the mould register to plan it.` : row.best?.why}</p>
      )}
      {late && <p className="mt-1 text-xs font-semibold text-danger-400">{late}</p>}
      {startDue && <p className="mt-1 text-xs font-semibold text-warn-400">Planned to start {shortDay(wo.plannedStart)} — nothing runs it yet</p>}
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
  const { canWrite } = useAuth();
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
  const confirm = async (models = null) => {
    setBusy(true);
    try {
      const answer = await productionApi.confirmTaskPlan({ taskId: todo._id, models });
      setPlan(answer);
      if (answer.failed?.length) warn(`${answer.failed.length} not confirmed`, answer.failed.map((row) => `${row.model}: ${row.why}`).join(' · '));
      if (answer.confirmed) toast(`${answer.confirmed} model${answer.confirmed === 1 ? '' : 's'} on presses`, 'They read Planning on the task; the floor sees them in each press’s queue.');
      onChanged?.();
    } catch (failure) {
      warn('Not confirmed', failure.message);
    } finally {
      setBusy(false);
    }
  };
  /* It is running on its press: the run starts there; the task reads Started. */
  const run = async (row) => {
    setBusy(true);
    try {
      const answer = await productionApi.pressDayMove({ id: row.workOrder._id, move: 'confirm' });
      toast(`${row.model} running`, (answer.lines || []).join(' · '));
      await load();
      onChanged?.();
    } catch (failure) {
      warn(`${row.model} not started`, failure.message);
    } finally {
      setBusy(false);
    }
  };
  const proposeAgain = async () => {
    setBusy(true);
    try {
      setPlan(await productionApi.proposeTaskPlan(todo._id));
      toast('Proposed again', 'From the presses as they stand now.');
    } catch (failure) {
      warn('Not proposed', failure.message);
    } finally {
      setBusy(false);
    }
  };
  const needs = pressAttention(plan.models);
  const calm = !needs.waiting && !needs.blocked && !needs.late && !needs.proposed;
  return (
    <section aria-label="Presses" className="rounded-xl border border-line/[0.08] bg-line/[0.02] px-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-steel-100">Presses</p>
        <div className="flex flex-wrap gap-1.5" aria-label="Needs attention">
          {needs.proposed > 0 && <Pill tone="info">{needs.proposed} to confirm</Pill>}
          {needs.waiting > 0 && <Pill tone="warn">{needs.waiting} need{needs.waiting === 1 ? 's' : ''} a press</Pill>}
          {needs.late > 0 && <Pill tone="danger">{needs.late} late</Pill>}
          {needs.blocked > 0 && <Pill tone="danger">{needs.blocked} can’t be placed</Pill>}
          {calm && <Pill tone="success">✓ All on presses</Pill>}
        </div>
      </div>
      <ul className="mt-1 divide-y divide-line/[0.06]">
        {plan.models.map((row) => (
          <ModelRow key={row.model} row={row} mayPlan={mayPlan} mayRun={canWrite('production')} busy={busy} onPlace={place} onChoose={setChoosing} onConfirm={confirm} onRun={run} />
        ))}
      </ul>
      {/* The auto-planner's proposals: the in charge confirms them all in one tap, or asks again. */}
      {mayPlan && (needs.proposed > 0 || needs.waiting > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/[0.06] py-2.5">
          <p className="text-xs text-steel-500">Proposed by the planner from the presses now and your past choices.</p>
          <div className="flex items-center gap-1">
            <button type="button" className="row-action px-2 py-1 text-xs" disabled={busy} onClick={proposeAgain}>Propose again</button>
            {needs.proposed > 1 && <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => confirm()}>Confirm all {needs.proposed}</button>}
          </div>
        </div>
      )}
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
