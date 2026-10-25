import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmPaymentDialog, NotInBankDialog } from './ConfirmPaymentDialog.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * Accounts' own list on its desk [server: paymentGates `paymentsToConfirm`]: every payment
 * Payment Collection or PRT logged that Accounts has not yet seen in the bank, oldest first —
 * a table on a wide screen, a card each on a phone. Confirm asks for the bank line; Not in the
 * bank asks why. Confirming closes the Payment Collection task it was logged from.
 */

const paymentOf = (row) => ({
  receivableId: row.receivable._id,
  receiptId: row.receipt._id,
  amount: row.receipt.amount,
  mode: row.receipt.mode,
  reference: row.receipt.reference,
  receivedAt: row.receipt.receivedAt,
  by: row.receipt.by,
  label: [row.customer?.name, row.order?.number || row.receivable.number].filter(Boolean).join(' · '),
});

const modeWords = (receipt) => [receipt.mode && String(receipt.mode).toUpperCase(), receipt.reference].filter(Boolean).join(' · ') || '—';

export default function PaymentsToConfirm({ rows = [], onChanged }) {
  const [confirming, setConfirming] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const done = () => {
    setConfirming(null);
    setRejecting(null);
    onChanged?.();
  };
  if (!rows.length) return <p className="text-sm text-steel-500">No payments waiting for you to confirm.</p>;

  const actions = (row) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setConfirming(paymentOf(row))}>Confirm</button>
      <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setRejecting(paymentOf(row))}>Not in the bank</button>
    </div>
  );
  const where = (row) => (
    <>
      <Link to={`/payments/${row.receivable._id}`} className="font-semibold text-steel-50 hover:text-accent">{row.order?.number || row.receivable.number}</Link>
      {row.order?.number && <span className="text-xs text-steel-500"> · {row.receivable.number}</span>}
    </>
  );

  return (
    <div>
      {/* A wide screen: one line a payment. */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line/[0.08] text-left text-xs uppercase tracking-wide text-steel-500">
            <tr>
              <th className="px-3 py-2">Logged</th>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Mode · UTR</th>
              <th className="px-3 py-2">Logged by</th>
              <th className="px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.receipt._id} className="border-b border-line/[0.04] last:border-0">
                <td className="px-3 py-2 tabular-nums text-steel-300">{formatDate(row.receipt.loggedAt)}</td>
                <td className="px-3 py-2 text-steel-100">{row.customer?.name || '—'}</td>
                <td className="px-3 py-2">{where(row)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-steel-50">{formatCurrency(row.receipt.amount)}</td>
                <td className="px-3 py-2 text-steel-300">{modeWords(row.receipt)}</td>
                <td className="px-3 py-2 text-steel-300">{row.receipt.by || '—'}</td>
                <td className="px-3 py-2">{actions(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* A phone: a card a payment, the amount first. */}
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.receipt._id} className="card space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold tabular-nums text-steel-50">{formatCurrency(row.receipt.amount)}</p>
                <p className="truncate text-sm text-steel-300">{row.customer?.name || '—'}</p>
              </div>
              <p className="text-right text-sm">{where(row)}</p>
            </div>
            <p className="text-sm text-steel-300">{modeWords(row.receipt)}</p>
            <p className="text-xs text-steel-500">Logged {formatDate(row.receipt.loggedAt)}{row.receipt.by ? ` by ${row.receipt.by}` : ''}</p>
            {actions(row)}
          </article>
        ))}
      </div>
      {confirming && <ConfirmPaymentDialog payment={confirming} onClose={() => setConfirming(null)} onDone={done} />}
      {rejecting && <NotInBankDialog payment={rejecting} onClose={() => setRejecting(null)} onDone={done} />}
    </div>
  );
}
