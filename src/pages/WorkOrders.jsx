import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workOrdersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, EmptyState, ErrorState, Field, FormError, Modal, PageHeader, TableSkeleton } from '../components/ui.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { todayInIndia } from '../utils/taskForm.js';
import { WORK_ORDER_STATUS, byPress, lateness, movesFor } from '../utils/workOrders.js';

/** Plans a work order: press, start day, place in the press's queue — and any move. */
function PlanDialog({ wo, moves, onClose, onSaved }) {
  const [machine, setMachine] = useState(wo.machine?._id || '');
  const [start, setStart] = useState(wo.plannedStart ? String(wo.plannedStart).slice(0, 10) : '');
  const [sequence, setSequence] = useState(wo.sequence ?? '');
  const [move, setMove] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const recipe = movesFor(moves, wo.status).find((entry) => entry.key === move);
  const noteShort = recipe?.needsNote && note.trim().length < 3;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await workOrdersApi.plan({
        id: wo._id, updatedAt: wo.updatedAt,
        machine: machine || null,
        plannedStart: start || null,
        sequence: sequence === '' ? null : Number(sequence),
        ...(move ? { move } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }));
      onClose();
    } catch (failure) {
      setProblem(failure);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Plan ${wo.number}`} description={`${wo.mould?.mouldCode || wo.modelNumber || ''} · ${formatNumber(wo.toMakeQty)} still to make${wo.dueDate ? ` · due ${formatDate(wo.dueDate)}` : ''}`}>
      <form onSubmit={save} className="space-y-4" aria-label="Plan the work order">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Press"><MachineSelect value={machine} onChange={setMachine} emptyLabel="Not on a press yet" /></Field>
          <Field label="Start on" hint="The end follows from the mould's pieces a day"><input type="date" className="input" min={todayInIndia()} value={start} onChange={(event) => setStart(event.target.value)} /></Field>
          <Field label="Place in the press's queue" hint="1 runs first"><input type="number" min={0} className="input" value={sequence} onChange={(event) => setSequence(event.target.value)} /></Field>
          <Field label="Move">
            <select className="input" value={move} onChange={(event) => setMove(event.target.value)}>
              <option value="">Keep it {WORK_ORDER_STATUS[wo.status]?.label.toLowerCase()}</option>
              {movesFor(moves, wo.status).map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Note" required={Boolean(recipe?.needsNote)}><input className="input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></Field>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || noteShort}>{busy ? 'Saving…' : 'Save the plan'}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Work orders: one per released order line [server: workOrder.service]. Grouped by press, each
 * press's queue in order, with what is made against what was ordered and the plan's end against
 * the due date. Production plans and moves them; a run starts straight from one.
 */
export default function WorkOrders() {
  const { canWrite } = useAuth();
  const mayPlan = canWrite('production');
  const [params] = useSearchParams();
  const order = params.get('order') || undefined;
  const [show, setShow] = useState('open');
  const [rows, setRows] = useState(null);
  const [moves, setMoves] = useState({});
  const [error, setError] = useState(null);
  const [planning, setPlanning] = useState(null);
  const load = useCallback(() => {
    workOrdersApi.list({ ...(show === 'open' ? { open: 'true' } : { status: show }), order }).then((answer) => {
      setRows(answer.data);
      setMoves(answer.meta?.moves || {});
      setError(null);
    }).catch(setError);
  }, [show, order]);
  useEffect(() => { load(); }, [load]);
  const groups = byPress(rows || []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Work orders"
        subtitle="One per released order line: which press makes it, in what order, and how much is made."
        actions={(
          <>
            <Link to="/production/plan" className="btn-secondary">Planning board</Link>
            <Link to="/mould-runs" className="btn-secondary">Mould runs</Link>
          </>
        )}
      />
      <div role="tablist" aria-label="Show" className="tab-track grid-flow-col">
        {[['open', 'Open'], ['completed', 'Made'], ['cancelled', 'Cancelled']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={show === key} className="tab py-1.5" onClick={() => setShow(key)}>{label}</button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!rows && !error && <TableSkeleton rows={6} columns={7} />}
      {rows && !rows.length && <EmptyState title="No work orders here" description="A work order is raised for every line of an order released to production." />}
      {groups.map((group) => (
        <section key={group.key} className="card overflow-hidden" aria-label={group.label}>
          <div className="flex items-center justify-between border-b border-line/[0.06] px-4 py-2.5">
            <p className="font-semibold text-steel-100">{group.label}{group.machine?.tonnage ? <span className="text-xs font-normal text-steel-400"> · {group.machine.tonnage}T</span> : null}</p>
            <p className="text-xs text-steel-400">{group.rows.length} {group.rows.length === 1 ? 'job' : 'jobs'} · {formatNumber(group.rows.reduce((sum, wo) => sum + (wo.toMakeQty || 0), 0))} pcs to make</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Work order</th>
                  <th className="px-3 py-2 text-left">Make</th>
                  <th className="px-3 py-2 text-left">Made</th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {group.rows.map((wo) => {
                  const late = lateness(wo);
                  const status = WORK_ORDER_STATUS[wo.status] || { label: wo.status, tone: 'neutral' };
                  return (
                    <tr key={wo._id} className="row-hover">
                      <td className="px-3 py-2.5 tabular-nums text-steel-400">{wo.sequence ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-steel-100">{wo.number}</p>
                        <p className="text-xs text-steel-400">{[wo.customer?.name, wo.order?.number].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-steel-100">{wo.mould?.mouldCode || wo.modelNumber || '—'}</p>
                        <p className="text-xs text-steel-400">{[wo.colour, `${formatNumber(wo.quantity)} pcs`].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="min-w-[9rem] px-3 py-2.5">
                        <div className="h-1.5 rounded-full bg-line/[0.08]"><div className="h-1.5 rounded-full bg-success-500" style={{ width: `${wo.madePercent || 0}%` }} /></div>
                        <p className="mt-1 text-xs text-steel-400">{formatNumber(wo.goodQty)} good{wo.rejectedQty ? ` · ${formatNumber(wo.rejectedQty)} rejected` : ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-steel-300">{wo.plannedStart ? `${formatDate(wo.plannedStart)} to ${formatDate(wo.plannedEnd)}` : 'Not planned'}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-steel-200">{wo.dueDate ? formatDate(wo.dueDate) : '—'}</p>
                        {late && <Badge tone={late.tone}>{late.label}</Badge>}
                      </td>
                      <td className="px-3 py-2.5"><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        {mayPlan && <button type="button" className="row-action" onClick={() => setPlanning(wo)}>Plan</button>}
                        {mayPlan && ['planned', 'released', 'paused'].includes(wo.status) && (
                          <Link className="row-action ml-2" to={`/mould-runs?start=1&workOrder=${wo._id}`}>Start run</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {planning && <PlanDialog wo={planning} moves={moves} onClose={() => setPlanning(null)} onSaved={() => load()} />}
    </div>
  );
}
