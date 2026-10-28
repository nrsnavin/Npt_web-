import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orders as ordersApi } from '../api/endpoints.js';
import { Notice } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';

/**
 * The sales order the SO team's upload drafted [server: soDraftReview.service] — read by two
 * people before the plant sees it: the SO team verifies it against the SO they sent, and the
 * enquiry's marketing person or Admin confirms it is the buyer's order. Shown wherever either of
 * them looks: the enquiry page, the SO task and the order itself. Each line as drafted, how it was
 * drafted (the SO PDF, or the request's lines) and where the two disagree; then who has read it,
 * who still must, and the button for whoever may act here. Both done, it says what followed —
 * released to production, Production asked, or waiting for Move to Production.
 */
export default function SalesOrderDraft({ orderId, onChanged, title = 'Sales order draft' }) {
  const { toast, warn } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => ordersApi.draft(orderId).then(setData).catch((failure) => setError(failure.message)), [orderId]);
  useEffect(() => { if (orderId) load(); }, [orderId, load]);

  if (!orderId) return null;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data?.review) return null;
  const { data: order, review } = data;

  const act = (how) => async () => {
    setBusy(true);
    try {
      const answer = await how({ id: orderId, ...(note.trim() ? { note: note.trim() } : {}) });
      setData(answer);
      setNote('');
      const outcome = answer.outcome || {};
      if (outcome.pending) toast('Thank you — one more reading', outcome.released ? '' : answer.review?.waits || '');
      else if (outcome.released) toast(`${order.number} verified and confirmed`, outcome.said || 'Released to production.');
      else toast(`${order.number} verified and confirmed`, outcome.said || '');
      onChanged?.(answer);
    } catch (failure) {
      warn('Not recorded', failure?.response?.data?.message || failure.message);
    } finally {
      setBusy(false);
    }
  };

  const source = review.from === 'so_pdf'
    ? `Drafted by reading the SO PDF${review.soNumber ? ` (${review.soNumber}${review.soDate ? `, ${review.soDate}` : ''})` : ''}`
    : 'Drafted from the SO request’s lines';
  const money = order.lines?.some((line) => line.unitPrice != null);
  const Reading = ({ label, check, may, button, onClick }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/[0.08] px-3 py-2 text-sm">
      <span>
        <span className="font-semibold text-steel-100">{label}:</span>{' '}
        {check ? (
          <span className="text-success-400">done by {check.by || 'someone'}{check.at ? ` · ${formatDate(check.at)}` : ''}{check.note ? ` — “${check.note}”` : ''}</span>
        ) : <span className="text-warn-400">waiting</span>}
      </span>
      {may && !check && <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={onClick}>{busy ? 'Saving…' : button}</button>}
    </div>
  );

  return (
    <section aria-label={title} className={`space-y-3 rounded-xl border p-4 ${review.pending ? 'border-warn-500/40 bg-warn-500/[0.05]' : 'border-success-500/30 bg-success-500/[0.04]'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-steel-50">
          {title} · <Link to={`/orders/${order._id}`} className="text-accent hover:underline">{order.number}</Link>
          {order.customerPo?.number ? <span className="font-normal text-steel-400"> · PO {order.customerPo.number}</span> : null}
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${review.pending ? 'bg-warn-500/15 text-warn-400' : 'bg-success-500/15 text-success-400'}`}>
          {review.pending ? 'Draft — to be read' : 'Verified and confirmed'}
        </span>
      </div>
      <p className="text-sm text-steel-300">{source}{review.draftedAt ? ` on ${formatDate(review.draftedAt)}` : ''}.{review.readProblem ? ` The SO PDF was not used: ${review.readProblem}.` : ''}</p>
      {review.differences?.length > 0 && (
        <Notice tone="warn">
          <p className="font-semibold">The SO differs from the request</p>
          <ul className="mt-1 list-disc pl-5 text-xs">{review.differences.map((line) => <li key={line}>{line}</li>)}</ul>
        </Notice>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Drafted lines">
          <thead className="text-left text-xs text-steel-400">
            <tr>
              <th className="py-1.5 pr-3">Model</th>
              <th className="py-1.5 pr-3">Material / colour</th>
              <th className="py-1.5 pr-3">Hook · Clip · Print</th>
              <th className="py-1.5 pr-3 text-right">Pieces</th>
              {money && <th className="py-1.5 pr-3 text-right">Rate</th>}
              <th className="py-1.5">EDD</th>
            </tr>
          </thead>
          <tbody>
            {(order.lines || []).map((line, index) => (
              <tr key={line._id || index} className="border-t border-line/[0.06]">
                <td className="py-1.5 pr-3 font-semibold text-steel-100">{line.modelNumber || line.mould?.mouldCode || '—'}{line.remarks ? <span className="block text-xs font-normal text-warn-400">{line.remarks}</span> : null}</td>
                <td className="py-1.5 pr-3 text-steel-200">{[line.materialRef?.name || line.material, line.colour].filter(Boolean).join(' · ') || '—'}</td>
                <td className="py-1.5 pr-3 text-steel-200">{[line.hookRef?.name, line.clipRef?.name, line.printRef?.name || line.printing].filter(Boolean).join(' · ') || '—'}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-steel-100">{formatNumber(line.quantity)}</td>
                {money && <td className="py-1.5 pr-3 text-right tabular-nums text-steel-100">{line.unitPrice != null ? formatCurrency(line.unitPrice) : '—'}</td>}
                <td className="py-1.5 text-steel-200">{line.deliveryDate ? formatDate(line.deliveryDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.paymentTerms && <p className="text-xs text-steel-400">Payment terms: {order.paymentTerms}</p>}
      <div className="space-y-2">
        <Reading label="Sales / SO team verification" check={review.verified} may={review.mayVerify} button="Verify the draft" onClick={act(ordersApi.verifyDraft)} />
        <Reading label="Marketing / Admin confirmation" check={review.confirmed} may={review.mayConfirm} button="Confirm the draft" onClick={act(ordersApi.confirmDraft)} />
        {(review.mayVerify || review.mayConfirm) && (
          <input className="input" placeholder="A note with your reading (optional)" aria-label="Note with the reading" value={note} onChange={(event) => setNote(event.target.value)} />
        )}
      </div>
      {review.pending
        ? <p className="text-xs text-steel-400">{review.waits}. Nothing goes to production until both have read it.</p>
        : <p className="text-xs text-steel-400">Both have read it — the order went on as the request said{review.enquiry ? <>: see <Link to={`/enquiries/${review.enquiry._id}`} className="text-accent hover:underline">{review.enquiry.number}</Link></> : ''}.</p>}
    </section>
  );
}
