import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';
import { shortDay } from '../utils/planningBoard.js';
import { todayInIndia } from '../utils/taskForm.js';
import { TRADE_STATUS, tradeActions } from '../utils/trading.js';

/**
 * Traded items [server: trading.service] — the models on Production tasks that are bought in
 * finished, never moulded. With production floor planning on, only what the plant makes goes to
 * the presses; these come here, and the Production team moves each one as the supplier delivers:
 * ordered (with the day it is expected), received in part or in full. Received moves the model on
 * the task to Production Completed, so Printing, Assembly and Dispatch carry on as for a moulded one.
 */

const TONE = {
  warn: 'bg-warn-500/15 text-warn-400 ring-warn-500/30',
  info: 'bg-aqua-500/15 text-aqua-300 ring-aqua-500/30',
  success: 'bg-success-500/15 text-success-400 ring-success-500/30',
  neutral: 'bg-line/[0.06] text-steel-300 ring-line/[0.12]',
};

function Pill({ tone, children }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE[tone] || TONE.neutral}`}>{children}</span>;
}

/** The form for one move: ordered, received, or cancelled. */
function MoveForm({ line, move, busy, onSave, onClose }) {
  const [expectedOn, setExpectedOn] = useState(line.expectedDay || '');
  const [supplier, setSupplier] = useState(line.supplier || '');
  const [supplierRef, setSupplierRef] = useState(line.supplierRef || '');
  const [receivedQty, setReceivedQty] = useState(String(line.quantity || ''));
  const [receivedOn, setReceivedOn] = useState(todayInIndia());
  const [note, setNote] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (move === 'ordered') onSave({ status: 'ordered', expectedOn, supplier, supplierRef });
    if (move === 'received') onSave({ status: Number(receivedQty) >= (line.quantity || 0) ? 'received' : 'part_received', receivedQty: Number(receivedQty), receivedOn });
    if (move === 'cancelled') onSave({ status: 'cancelled', note });
  };
  const titles = { ordered: `Ordered — ${line.model}`, received: `Received — ${line.model}`, cancelled: `Cancel — ${line.model}` };
  return (
    <Modal open title={titles[move]} description={`${line.number} · ${formatNumber(line.quantity)} pcs${line.dueDay ? ` · needed by ${shortDay(line.dueDay)}` : ''}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {move === 'ordered' && (
          <>
            <Field label="Expected on" required hint={line.dueDay ? `Needed by ${shortDay(line.dueDay)}` : undefined}>
              <input type="date" className="input" required value={expectedOn} min={todayInIndia()} onChange={(event) => setExpectedOn(event.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Supplier"><input className="input" value={supplier} onChange={(event) => setSupplier(event.target.value)} /></Field>
              <Field label="Supplier’s PO / ref"><input className="input" value={supplierRef} onChange={(event) => setSupplierRef(event.target.value)} /></Field>
            </div>
            {expectedOn && line.dueDay && expectedOn > line.dueDay && <p className="text-xs font-semibold text-danger-400">After the day it is needed ({shortDay(line.dueDay)}) — tell the Production in charge.</p>}
          </>
        )}
        {move === 'received' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pieces received, in all" required hint={`Of ${formatNumber(line.quantity)} ordered`}>
              <input type="number" min="1" className="input" required value={receivedQty} onChange={(event) => setReceivedQty(event.target.value)} />
            </Field>
            <Field label="Received on" required><input type="date" className="input" required value={receivedOn} max={todayInIndia()} onChange={(event) => setReceivedOn(event.target.value)} /></Field>
          </div>
        )}
        {move === 'cancelled' && (
          <Field label="Why" required><input className="input" required minLength={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="submit" className={move === 'cancelled' ? 'btn-danger' : 'btn-primary'} disabled={busy}>{move === 'cancelled' ? 'Cancel it' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function TradedSupply() {
  const { canWrite, canRead } = useAuth();
  const mayMove = canWrite('production');
  const { toast, warn } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [all, setAll] = useState(false);
  const [moving, setMoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => productionApi.trading(all ? { status: 'all' } : undefined).then((value) => { setData(value); setError(null); }).catch(setError), [all]);
  useEffect(() => { load(); }, [load]);

  const save = async (body) => {
    setBusy(true);
    try {
      const line = await productionApi.updateTrade({ id: moving.line._id, ...body });
      toast(`${line.model} — ${TRADE_STATUS[line.status]?.words || line.status}`, line.status === 'received' ? 'It reads Production Completed on the task; the next team carries on.' : undefined);
      setMoving(null);
      load();
    } catch (failure) {
      warn('Not saved', failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Traded items"
        subtitle="Models bought in for Production tasks — not moulded here. Update each one as the supplier delivers."
        actions={canRead('materials') ? <Link to="/trading" className="btn-secondary">Trading master</Link> : null}
      />
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <Spinner label="Loading traded items" />}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {data.counts.to_order > 0 && <Pill tone="warn">{data.counts.to_order} to order</Pill>}
            {data.counts.ordered > 0 && <Pill tone="info">{data.counts.ordered} ordered</Pill>}
            {data.counts.part_received > 0 && <Pill tone="info">{data.counts.part_received} part received</Pill>}
            {data.late > 0 && <span className="inline-flex items-center rounded-full bg-danger-500/15 px-2.5 py-0.5 text-xs font-semibold text-danger-400 ring-1 ring-inset ring-danger-500/30">{data.late} late</span>}
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-steel-300">
              <input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} /> Show received and cancelled
            </label>
          </div>

          {!data.rows.length ? (
            <EmptyState title="Nothing to buy in" description="A traded model lands here when Production routes a task with it — with floor planning on." />
          ) : (
            <ul className="divide-y divide-line/[0.06] overflow-hidden rounded-2xl border border-line/[0.08] bg-ink-850 shadow-raised">
              {data.rows.map((line) => {
                const look = TRADE_STATUS[line.status] || TRADE_STATUS.to_order;
                return (
                  <li key={line._id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    {line.late && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-full bg-danger-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-steel-50">{line.model}</span>
                        {line.tradedItem?.code && <span className="text-xs text-steel-500">{line.tradedItem.code}</span>}
                        <span className="text-xs text-steel-400">
                          {line.enquiry ? <Link to={`/enquiries/${line.enquiry._id}`} className="hover:underline">{line.enquiry.number}</Link> : 'Team task'}
                          {line.customer ? ` · ${line.customer}` : ''}
                        </span>
                      </p>
                      <p className="text-xs tabular-nums text-steel-400">
                        {line.receivedQty ? `${formatNumber(line.receivedQty)} of ` : ''}{formatNumber(line.quantity)} pcs
                        {line.dueDay ? <> · needed by <span className={line.late ? 'font-semibold text-danger-400' : 'text-steel-200'}>{shortDay(line.dueDay)}</span></> : null}
                        {line.supplier ? ` · ${line.supplier}` : ''}{line.supplierRef ? ` (${line.supplierRef})` : ''}
                        {line.expectedDay && ['ordered', 'part_received'].includes(line.status) ? <> · expected <span className="text-steel-200">{shortDay(line.expectedDay)}</span></> : null}
                      </p>
                    </div>
                    <Pill tone={look.tone}>{look.words}</Pill>
                    {mayMove && (
                      <div className="flex items-center gap-1">
                        {tradeActions(line.status).map(({ move, label, primary }) => (
                          <button key={move} type="button" className={primary ? 'btn-primary px-3 py-1.5 text-xs' : 'row-action px-2 py-1 text-xs'} onClick={() => setMoving({ line, move })}>{label}</button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!mayMove && <p className="text-xs text-steel-500">The Production team updates these.</p>}
        </>
      )}
      {moving && <MoveForm line={moving.line} move={moving.move} busy={busy} onSave={save} onClose={() => setMoving(null)} />}
    </div>
  );
}
