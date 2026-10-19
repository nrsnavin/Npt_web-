import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * The money on the enquiry [server: handoff.controller `paymentsOnEnquiry`]: each RCV — the
 * advance, each invoice — with what came in, and every payment logged on it: how much, how, the
 * UTR, who logged it, and whether it is confirmed (the payment gates open only on confirmed money).
 */
export default function EnquiryPayments({ payments = [] }) {
  const { canRead } = useAuth();
  if (!payments.length) return null;
  return (
    <div className="space-y-2" aria-label="Payments">
      {payments.map((row) => (
        <div
          key={row._id}
          className={`rounded-xl border px-3 py-2.5 ${row.balance > 0 ? 'border-warn-500/40 bg-warn-500/[0.06]' : 'border-success-500/40 bg-success-500/[0.07]'}`}
        >
          <p className="text-sm text-steel-100">
            {canRead('payments')
              ? <Link to={`/payments/${row._id}`} className="font-bold hover:text-accent">{row.number}</Link>
              : <span className="font-bold">{row.number}</span>}
            <span className="text-steel-400">
              {' · '}{row.kind === 'advance' ? 'Advance' : `Invoice${row.invoiceNumber ? ` ${row.invoiceNumber}` : ''}`}
              {row.order?.number ? ` · ${row.order.number}` : ''}
              {` · ${formatCurrency(row.value)}`}
            </span>
            <span className={`block text-xs font-semibold ${row.balance > 0 ? 'text-warn-400' : 'text-success-400'}`}>
              {row.balance > 0
                ? `${formatCurrency(row.received)} in · ${formatCurrency(row.balance)} still to come`
                : `Paid in full — ${formatCurrency(row.received)}`}
              {row.received > row.confirmed ? ` · ${formatCurrency(row.received - row.confirmed)} awaiting confirmation` : ''}
            </span>
          </p>
          {row.receipts.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-steel-300">
              {row.receipts.map((receipt, index) => (
                <li key={index}>
                  {formatCurrency(receipt.amount)} · {String(receipt.mode || '').toUpperCase()}
                  {receipt.reference ? ` · ${receipt.reference}` : ''}
                  {` · ${formatDate(receipt.at)}`}
                  {receipt.by ? ` · logged by ${receipt.by}` : ''}
                  <span className={receipt.confirmed ? 'text-success-400' : 'text-warn-400'}>{receipt.confirmed ? ' · confirmed' : ' · awaiting confirmation'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
