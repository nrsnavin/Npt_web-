import { useEffect, useMemo, useState } from 'react';
import { production as productionApi, workspace } from '../api/endpoints.js';
import { todayInIndia } from '../utils/taskForm.js';

/**
 * The floor, inside Production's status move [server: productionStep.service]. The in charge moves
 * the status as before — the move also says the press, and the floor follows:
 *
 *   Accepted / Planning              plan it on a press
 *   Started                          confirm production on a press — the run starts on it
 *   Part 1 / Part 2 ready, Completed the good pieces made — the run ends (and goes on, for a part)
 *   Mould issue / Raw material       the press is called in (andon), with the remark
 *   Machine Not Allotted             the alternate press, ranked best first — it reads Planning there
 *
 * The ready date starts from the press plan: the day moulding ends on the press it is planned on.
 *
 * Back to Started after a stop puts the press called in back to running. Nothing here is needed:
 * "Not on a press yet" moves the status alone. With floor planning off, the press chosen is
 * only written on the status.
 */

export const PRESS_STEPS = {
  accepted: 'plan', planning: 'plan',
  started: 'start',
  part1_ready: 'made', part2_ready: 'made', completed: 'made',
  mould_issue: 'stop', raw_material: 'stop',
  machine_not_allotted: 'plan',
};

/** A Production status move that also moves the floor. */
export const pressStepOf = (todo, status) => (todo?.kind === 'ask_edd' ? PRESS_STEPS[status] || null : null);

const pressLabel = (press) => [
  press.code,
  press.tonnage ? ` · ${press.tonnage}T` : '',
  press.running ? ` — running ${press.running.number}${press.running.model ? ` (${press.running.model})` : ''}` : '',
  press.calledIn ? ' — called in' : '',
].join('');
const pieces = (count) => Number(count || 0).toLocaleString('en-IN');
/* Ranked presses first, best first; the rest after, as listed. */
const rankedPresses = (presses, ranked) => (ranked
  ? [...presses].sort((a, b) => (ranked.byId[a._id]?.rank ?? 1e6) - (ranked.byId[b._id]?.rank ?? 1e6))
  : presses);

const dayOf = (at) => (at ? todayInIndia(new Date(at)) : null);
const shortDate = (at) => new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/**
 * `onChange({ floor, label, missing, readyBy })`: what goes with the move as `floor`, the submit
 * button's words, what is still to give before it can be sent, and — the press it is planned on
 * kept — the day moulding ends there, for the ready date (`readyBy.date`, `readyBy.models`).
 */
export default function PressStep({ todo, status, models, onChange }) {
  const kind = pressStepOf(todo, status);
  const [plan, setPlan] = useState(null);
  const [problem, setProblem] = useState(null);
  const [skip, setSkip] = useState(false);
  const [presses, setPresses] = useState({});
  const [counters, setCounters] = useState({});
  const [made, setMade] = useState({});
  const [stop, setStop] = useState(true);
  /* Planning on a press (Machine Not Allotted, Planning): each model's presses ranked, best first. */
  const [ranks, setRanks] = useState({});
  const modelsKey = models.join('|');

  useEffect(() => {
    if (!kind) return undefined;
    let live = true;
    setPlan(null);
    setProblem(null);
    workspace.todos.pressStep({ id: todo._id, status, models }).then((data) => {
      if (!live) return;
      setPlan(data);
      /* An alternate press is asked for: never the one it is planned on now. */
      const alternate = status === 'machine_not_allotted';
      setPresses(Object.fromEntries((data.models || []).map((row) => [row.model,
        alternate ? (row.suggested?._id && row.suggested._id !== row.planned?._id ? row.suggested._id : '') : row.running?.machine?._id || row.suggested?._id || ''])));
      /* Completed: what is left of the order, made now. */
      setMade(Object.fromEntries((data.models || []).filter((row) => row.workOrder).map((row) => [row.model, {
        good: status === 'completed' ? String(Math.max(0, row.workOrder.quantity - row.workOrder.goodQty)) : '',
        rejected: '',
      }])));
      if (kind === 'plan' && data.on) {
        for (const row of (data.models || []).filter((entry) => entry.workOrder && !entry.running)) {
          productionApi.choices(row.workOrder._id).then((ranked) => {
            if (!live) return;
            const byId = Object.fromEntries((ranked?.choices || []).map((choice) => [choice.machine._id, { rank: choice.rank, end: choice.end, late: choice.late }]));
            const cannot = Object.fromEntries((ranked?.cannot || []).map((entry) => [entry.machine._id, entry.why]));
            setRanks((current) => ({ ...current, [row.model]: { byId, cannot } }));
            /* Nothing chosen yet: the best press (other than the one it is on, for an alternate) starts the box. */
            const best = (ranked?.choices || []).find((choice) => status !== 'machine_not_allotted' || choice.machine._id !== row.planned?._id);
            if (best) setPresses((current) => ({ ...current, [row.model]: current[row.model] || best.machine._id }));
          }).catch(() => {});
        }
      }
    }).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, [todo._id, status, modelsKey, kind]);

  const rows = useMemo(() => (plan?.models || []), [plan]);
  /* With the floor planned, only a model with its work order goes on a press; off, every model may be named. */
  const onFloor = plan?.on ? rows.filter((row) => row.workOrder) : rows;
  const choosing = ['plan', 'start'].includes(kind);
  const running = rows.filter((row) => row.running);
  /* A model running cannot move press from here — it is finished on the floor first. */
  const pickable = kind === 'plan' ? onFloor.filter((row) => !row.running) : onFloor;

  const result = useMemo(() => {
    if (!kind || !plan) return { floor: null, label: null, missing: null };
    if (skip) return { floor: { skip: true }, label: null, missing: null };
    if (choosing) {
      const chosen = pickable.filter((row) => presses[row.model]).map((row) => ({
        model: row.model,
        machine: presses[row.model],
        ...(kind === 'start' && counters[row.model] !== undefined && counters[row.model] !== '' ? { counterStart: Number(counters[row.model]) } : {}),
      }));
      const codes = [...new Set(chosen.map((row) => plan.presses.find((press) => press._id === row.machine)?.code).filter(Boolean))];
      const missing = kind === 'start' && onFloor.length && !chosen.length ? 'Pick the press it runs on — or tick “Not on a press yet”' : null;
      /* Kept on the press it is planned on: moulding ends when the plan says. */
      const readyModels = Object.fromEntries(pickable
        .filter((row) => presses[row.model] && row.planned?._id === presses[row.model] && row.workOrder?.plannedEnd)
        .map((row) => [row.model, dayOf(row.workOrder.plannedEnd)]));
      const days = Object.values(readyModels).sort();
      return {
        floor: chosen.length ? { presses: chosen } : null,
        label: codes.length ? `${kind === 'start' ? 'Confirm production on' : 'Plan on'} ${codes.join(', ')}` : null,
        missing,
        readyBy: days.length ? { date: days.at(-1), models: readyModels } : null,
      };
    }
    if (kind === 'made' && plan.on) {
      const given = onFloor.filter((row) => made[row.model]?.good !== '' && made[row.model]?.good !== undefined && (row.running || row.planned)).map((row) => ({
        model: row.model, goodPieces: Number(made[row.model].good), rejectedPieces: Number(made[row.model].rejected) || 0,
      }));
      return { floor: given.length ? { made: given } : null, label: given.length ? 'Update status and log the pieces' : null, missing: null };
    }
    if (kind === 'stop' && plan.on && running.length) {
      return stop
        ? { floor: { stop: true, models: running.map((row) => row.model) }, label: `Update status and call in ${[...new Set(running.map((row) => row.running.machine?.code).filter(Boolean))].join(', ')}`, missing: null }
        : { floor: null, label: null, missing: null };
    }
    return { floor: null, label: null, missing: null };
  }, [kind, plan, skip, choosing, onFloor, presses, counters, made, stop, running]);

  const resultKey = JSON.stringify(result);
  useEffect(() => { onChange?.(result); }, [resultKey]);

  if (!kind) return null;
  if (problem) return <p className="text-xs text-warn-400">The presses could not be read ({problem}) — the status moves alone.</p>;
  if (!plan) return <p className="text-xs text-steel-400">Reading the presses…</p>;
  /* Nothing on the floor to say for this move. */
  if (!choosing && (!plan.on || (kind === 'stop' && !running.length) || (kind === 'made' && !onFloor.length))) return null;

  return (
    <fieldset className="space-y-2 rounded-lg border border-aqua-500/30 bg-aqua-500/[0.04] px-3 py-2" aria-label="The press">
      <legend className="px-1 text-xs font-semibold text-aqua-300">
        {kind === 'start' ? 'Confirm production on a press' : status === 'machine_not_allotted' ? 'The alternate press' : kind === 'plan' ? 'Plan it on a press' : kind === 'made' ? 'Pieces made' : 'Call in the press'}
      </legend>

      {choosing && !skip && onFloor.map((row) => (
        <div key={row.model} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center">
          <span className="min-w-0 text-xs text-steel-200">
            <span className="block truncate font-semibold">{row.model}</span>
            {row.workOrder && <span className="block text-steel-400">{row.workOrder.number} · {pieces(row.workOrder.goodQty)} of {pieces(row.workOrder.quantity)} made</span>}
            {row.workOrder?.mouldMissing && <span className="block text-warn-400">No mould on its work order yet</span>}
          </span>
          {kind === 'start' && row.running ? (
            <span className="text-xs text-success-400">
              Running on {row.running.machine?.code} ({row.running.number}){row.running.machine?.calledIn ? ' — called in; Started puts it back to running' : ''}
            </span>
          ) : kind === 'plan' && row.running ? (
            <span className="text-xs text-steel-300">Running on {row.running.machine?.code} ({row.running.number}) — finish it on the floor before it moves press</span>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Press for ${row.model}`}
                className="input min-w-0 flex-1 py-1.5"
                value={presses[row.model] || ''}
                onChange={(event) => setPresses((current) => ({ ...current, [row.model]: event.target.value }))}
              >
                <option value="">Choose the press…</option>
                {rankedPresses(plan.presses, ranks[row.model]).map((press) => {
                  const rank = ranks[row.model]?.byId[press._id];
                  const cannot = ranks[row.model]?.cannot[press._id];
                  return (
                    <option key={press._id} value={press._id} disabled={(kind === 'start' && Boolean(press.running)) || Boolean(cannot)}>
                      {pressLabel(press)}{rank ? ` · #${rank.rank} done ${shortDate(rank.end)}${rank.late ? ' (late)' : ''}` : ''}{cannot ? ` — can’t take it: ${cannot}` : ''}{status === 'machine_not_allotted' && row.planned?._id === press._id ? ' — on it now' : row.suggested?._id === press._id ? ` ★ ${row.suggestedWhy}` : ''}
                    </option>
                  );
                })}
              </select>
              {kind === 'start' && plan.on && (
                <input
                  type="number" min={0} inputMode="numeric" aria-label={`Counter now on the press for ${row.model}`} placeholder="Counter now"
                  className="input w-32 py-1.5" value={counters[row.model] ?? ''}
                  onChange={(event) => setCounters((current) => ({ ...current, [row.model]: event.target.value }))}
                />
              )}
            </span>
          )}
        </div>
      ))}
      {choosing && plan.on && rows.some((row) => !row.workOrder) && (
        <p className="text-xs text-steel-400">{rows.filter((row) => !row.workOrder).map((row) => row.model).join(', ')} — not on the floor (traded, or no work order): the status moves alone.</p>
      )}

      {kind === 'made' && onFloor.map((row) => (
        <div key={row.model} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <span className="min-w-0 text-xs text-steel-200">
            <span className="block truncate font-semibold">{row.model}</span>
            <span className="block text-steel-400">
              {row.running ? `${row.running.number} on ${row.running.machine?.code}` : row.planned ? `Planned on ${row.planned.code} — logged as a run on it` : 'No press on it — the status moves alone'}
              {` · ${pieces(row.workOrder.goodQty)} of ${pieces(row.workOrder.quantity)} made`}
            </span>
          </span>
          {(row.running || row.planned) && (
            <>
              <input type="number" min={0} inputMode="numeric" aria-label={`Good pieces of ${row.model}`} placeholder="Good pieces" className="input w-32 py-1.5"
                value={made[row.model]?.good ?? ''} onChange={(event) => setMade((current) => ({ ...current, [row.model]: { ...current[row.model], good: event.target.value } }))} />
              <input type="number" min={0} inputMode="numeric" aria-label={`Rejected pieces of ${row.model}`} placeholder="Rejected" className="input w-28 py-1.5"
                value={made[row.model]?.rejected ?? ''} onChange={(event) => setMade((current) => ({ ...current, [row.model]: { ...current[row.model], rejected: event.target.value } }))} />
            </>
          )}
        </div>
      ))}
      {kind === 'made' && status !== 'completed' && onFloor.some((row) => made[row.model]?.good !== '' && made[row.model]?.good !== undefined && Number(made[row.model].good) >= row.workOrder.quantity - row.workOrder.goodQty) && (
        <p className="text-xs text-success-400">That makes the full quantity — the model reads Production Completed.</p>
      )}
      {kind === 'made' && <p className="text-xs text-steel-400">{status === 'completed' ? 'The run ends with these pieces.' : 'The run ends with these pieces and the press goes on with the rest.'} Leave blank to move the status alone.</p>}

      {kind === 'stop' && (
        <label className="flex items-start gap-2 text-xs text-steel-200">
          <input type="checkbox" checked={stop} onChange={(event) => setStop(event.target.checked)} />
          <span>Call in {running.map((row) => `${row.running.machine?.code} (${row.running.number}, ${row.model})`).join(', ')} — the remark goes on the call. Started, when it runs again, clears it.</span>
        </label>
      )}

      {choosing && (
        <label className="flex items-center gap-2 text-xs text-steel-300">
          <input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} />
          Not on a press yet — just change the status
        </label>
      )}
      {choosing && !plan.on && !skip && <p className="text-xs text-steel-400">Floor planning is off: the press is written on the status, for everyone to read.</p>}
      {kind === 'start' && plan.on && !skip && <p className="text-xs text-steel-400">The run starts on the press now — the floor, the planning board and the task all read it.</p>}
      {status === 'machine_not_allotted' && plan.on && !skip && <p className="text-xs text-steel-400">Best first, with when it would be done. Picked, it reads Planning on that press.</p>}
    </fieldset>
  );
}
