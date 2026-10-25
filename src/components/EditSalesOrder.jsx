import { useEffect, useState } from 'react';
import { orders as ordersApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import { formatNumber } from '../utils/format.js';
import { PAYMENT_PRESETS, presetFor } from '../utils/paymentTerms.js';

/**
 * Edit sales order [server: orderEdits.service] — the two corrections Admin or the buyer's
 * marketing person makes to an SO already prepared, released included:
 *
 *   Payment terms   the new terms say first what they do to production. Already in production and
 *                   the new terms want an advance not in: an alert, and the choice — hold
 *                   production until it is paid, or keep it running while Payment Collection
 *                   chases it. Waiting only for the advance and the new terms want none: it goes
 *                   to the plant.
 *   Pieces          each line's pieces; the work orders, Production's, Printing's, Assembly's and
 *                   Dispatch's tasks follow. Never below what is on a consignment.
 */

function TermsPanel({ order, onSaved }) {
  const { toast } = useToast();
  const current = presetFor(order.paymentTerms)?.key || '';
  const [terms, setTerms] = useState(current);
  const [preview, setPreview] = useState(null);
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    setPreview(null);
    setDecision('');
    if (!terms || terms === current) return undefined;
    let live = true;
    ordersApi.termsPreview({ id: order._id, terms }).then((value) => { if (live) setPreview(value); }).catch((failure) => { if (live) setProblem(failure.message); });
    return () => { live = false; };
  }, [order._id, terms, current]);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await ordersApi.changeTerms({ id: order._id, terms, ...(decision ? { decision } : {}) });
      toast('Payment terms changed', reply.said);
      onSaved(reply);
    } catch (failure) {
      /* The order went into production since the preview: the choice, rather than a bare refusal. */
      if (failure.details?.code === 'TERMS_IN_PRODUCTION') setPreview(failure.details.preview);
      else setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Payment terms">
      <Field label="Payment terms" hint={`Now: ${order.paymentTerms || 'not set'}`}>
        <select className="input" value={terms} onChange={(event) => setTerms(event.target.value)}>
          <option value="">Pick the terms…</option>
          {PAYMENT_PRESETS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
      </Field>
      {preview && (
        <div className={`rounded-xl border p-3 text-sm ${preview.needsDecision ? 'border-danger-500/50 bg-danger-500/[0.08]' : 'border-line/[0.1] bg-line/[0.03]'}`} role={preview.needsDecision ? 'alert' : undefined}>
          {preview.needsDecision && <p className="font-bold text-danger-400">⚠ Already in production</p>}
          <p className="text-steel-200">{preview.message}</p>
          {preview.needsDecision && (
            <div className="mt-2 space-y-1.5">
              <label className="flex items-start gap-2 text-steel-100">
                <input type="radio" name="decision" className="mt-1" checked={decision === 'hold'} onChange={() => setDecision('hold')} />
                <span><span className="font-semibold">Hold production until it is paid</span><span className="block text-xs text-steel-400">The plant stops; its jobs open again when the advance is confirmed and the order is released.</span></span>
              </label>
              <label className="flex items-start gap-2 text-steel-100">
                <input type="radio" name="decision" className="mt-1" checked={decision === 'keep'} onChange={() => setDecision('keep')} />
                <span><span className="font-semibold">Keep it running</span><span className="block text-xs text-steel-400">Payment Collection chases the advance while the plant carries on.</span></span>
              </label>
            </div>
          )}
        </div>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end">
        <button type="button" className={preview?.needsDecision && decision === 'hold' ? 'btn-danger' : 'btn-primary'} disabled={busy || !preview || (preview.needsDecision && !decision)} onClick={save}>
          {busy ? 'Saving…' : preview?.needsDecision && decision === 'hold' ? 'Change terms & hold production' : 'Change payment terms'}
        </button>
      </div>
    </section>
  );
}

function PiecesPanel({ order, onSaved }) {
  const { toast } = useToast();
  const [pieces, setPieces] = useState(() => Object.fromEntries((order.lines || []).map((line) => [line._id, String(line.quantity)])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const changed = (order.lines || []).filter((line) => Number(pieces[line._id]) !== line.quantity);
  const released = !['po_received', 'order_verification', 'clarification_pending'].includes(order.status);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await ordersApi.changeQuantities({ id: order._id, lines: changed.map((line) => ({ _id: line._id, quantity: Number(pieces[line._id]) })), ...(note.trim() ? { note: note.trim() } : {}) });
      toast('Pieces changed', reply.said);
      onSaved(reply);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Pieces">
      {released && <p className="text-xs text-steel-400">In production: the planning board’s jobs, and Production’s, Printing’s, Assembly’s and Dispatch’s tasks, take the new pieces — each team is told.</p>}
      <ul className="divide-y divide-line/[0.06] rounded-xl border border-line/[0.08]">
        {(order.lines || []).map((line) => (
          <li key={line._id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-steel-100">{line.mould?.mouldCode || line.modelNumber || 'Line'}</p>
              <p className="text-xs text-steel-400">Now {formatNumber(line.quantity)} pcs{line.production?.producedQty ? ` · ${formatNumber(line.production.producedQty)} made` : ''}</p>
            </div>
            <input type="number" min="1" step="1" className="input w-32 tabular-nums" aria-label={`Pieces for ${line.modelNumber || 'line'}`} value={pieces[line._id] ?? ''} onChange={(event) => setPieces({ ...pieces, [line._id]: event.target.value })} />
          </li>
        ))}
      </ul>
      <Field label="Why (optional)"><input className="input" value={note} maxLength={300} placeholder="Buyer added 2,000 on WhatsApp" onChange={(event) => setNote(event.target.value)} /></Field>
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={busy || !changed.length || changed.some((line) => !(Number(pieces[line._id]) >= 1))} onClick={save}>
          {busy ? 'Saving…' : `Change pieces${changed.length ? ` (${changed.length})` : ''}`}
        </button>
      </div>
    </section>
  );
}

export default function EditSalesOrder({ order, onClose, onSaved }) {
  const [tab, setTab] = useState('terms');
  const saved = (reply) => { onSaved(reply); onClose(); };
  return (
    <Modal open title={`Edit ${order.number}`} description="Payment terms and pieces — production follows what you change here" onClose={onClose} size="lg">
      <div className="mb-4 flex gap-1 rounded-lg bg-line/[0.05] p-1 text-sm" role="tablist">
        {[['terms', 'Payment terms'], ['pieces', 'Pieces']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`flex-1 rounded-md px-3 py-1.5 font-semibold ${tab === key ? 'bg-ink-850 text-steel-50 shadow-raised' : 'text-steel-400'}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === 'terms' ? <TermsPanel order={order} onSaved={saved} /> : <PiecesPanel order={order} onSaved={saved} />}
    </Modal>
  );
}
