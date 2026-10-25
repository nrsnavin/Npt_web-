import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ConfirmPaymentDialog, NotInBankDialog } from './ConfirmPaymentDialog.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * Payments Accounts did not find in the bank, still open [server: paymentGates.service
 * `notInBankOn`] — a red banner on the enquiry, the sales order and the dispatch hold: each with
 * its RCV number, amount, UTR, why, who logged it and who said so. Gone once the money is
 * confirmed late or the payment is logged again.
 */
export function NotInBankBanner({ rows = [], compact = false }) {
  const { canRead } = useAuth();
  if (!rows.length) return null;
  return (
    <div className={`rounded-xl border border-danger-500/50 bg-danger-500/[0.08] ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`} role="alert" aria-label="Payment not in bank">
      <p className="text-sm font-bold text-danger-400">⚠ {rows.length === 1 ? 'Payment not in bank' : `${rows.length} payments not in bank`} — recheck with the buyer</p>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row._id} className="text-xs text-steel-200">
            <span className="font-semibold text-danger-400">{formatCurrency(row.amount)}</span>
            {row.mode ? ` · ${String(row.mode).toUpperCase()}` : ''}{row.reference ? ` · ${row.reference}` : ''}
            {' on '}
            {canRead('payments') ? <Link to={`/payments/${row.receivable._id}`} className="font-semibold hover:text-accent">{row.receivable.number}</Link> : <span className="font-semibold">{row.receivable.number}</span>}
            {row.order?.number ? ` (${row.order.number})` : ''}
            {' — '}
            <span className="font-semibold">{row.reason}</span>{row.reasonNote ? `: ${row.reasonNote}` : ''}
            <span className="text-steel-400">{row.loggedBy ? ` · logged by ${row.loggedBy}` : ''}{row.rejectedBy ? ` · ${row.rejectedBy}, Accounts` : ''}{row.rejectedAt ? ` · ${formatDate(row.rejectedAt)}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATE_WORDS = {
  awaiting: { label: 'Waiting for Accounts', tone: 'text-warn-400' },
  confirmed: { label: 'Confirmed in the bank', tone: 'text-success-400' },
  not_in_bank: { label: 'Not in bank', tone: 'text-danger-400' },
  confirmed_late: { label: 'Came after all — confirmed', tone: 'text-success-400' },
  logged_again: { label: 'Logged again', tone: 'text-steel-400' },
};

/**
 * The payments behind a Payment Collection, PRT or A/C Clarify task [server: paymentGates
 * `receiptsOfTask`] — by RCV number, with the amount, mode, UTR or cheque number, who logged it
 * and where it stands. So a question to Accounts, and the team's reply after Not in bank (the
 * payment logged again), carry the receipt Accounts is to confirm; Accounts confirms it, says it
 * is not in the bank, or confirms one that came late, right here.
 */
export default function TaskReceipts({ todo, onChanged }) {
  const { isManagement, departments = [] } = useAuth();
  const seesTheBank = isManagement || departments.includes('accounts');
  const [rows, setRows] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const load = () => workspace.todos.receipts(todo._id).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo._id, todo.updatedAt, todo.status]);
  if (!rows?.length) return null;
  const paymentOf = (row) => ({
    receivableId: row.receivable._id, receiptId: row._id, amount: row.amount, mode: row.mode, reference: row.reference,
    receivedAt: row.receivedAt, by: row.by, label: [row.customer, row.receivable.number, row.order?.number].filter(Boolean).join(' · '),
  });
  const done = () => { setConfirming(null); setRejecting(null); load(); onChanged?.(); };
  return (
    <section className="rounded-lg border border-line/[0.08] px-3 py-2" aria-label="Payment receipts">
      <p className="text-xs font-bold uppercase tracking-wide text-steel-400">Payment receipts</p>
      <ul className="divide-y divide-line/[0.06]">
        {rows.map((row) => {
          const state = STATE_WORDS[row.state] || STATE_WORDS.awaiting;
          return (
            <li key={row._id} className={`py-2 text-sm ${row.state === 'not_in_bank' ? 'text-danger-400' : ''}`}>
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <Link to={`/payments/${row.receivable._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.receivable.number}</Link>
                  <span className="font-bold tabular-nums text-steel-100"> · {formatCurrency(row.amount)}</span>
                  <span className="text-xs text-steel-400">{row.mode ? ` · ${String(row.mode).toUpperCase()}` : ''}{row.reference ? ` · ${row.reference}` : ''}{row.receivedAt ? ` · ${formatDate(row.receivedAt)}` : ''}{row.by ? ` · logged by ${row.by}` : ''}</span>
                </span>
                <span className={`text-xs font-semibold ${state.tone}`}>{state.label}</span>
              </p>
              {row.state === 'not_in_bank' && (
                <p className="text-xs text-danger-400">{row.reason}{row.reasonNote ? `: ${row.reasonNote}` : ''}{row.rejectedBy ? ` · ${row.rejectedBy}` : ''}{row.rejectedAt ? `, ${formatDate(row.rejectedAt)}` : ''}</p>
              )}
              {seesTheBank && row.state === 'awaiting' && (
                <span className="mt-1 flex gap-1.5">
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setRejecting(paymentOf(row))}>Not in bank</button>
                  <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setConfirming(paymentOf(row))}>Confirm — seen in the bank</button>
                </span>
              )}
              {seesTheBank && row.state === 'not_in_bank' && (
                <button type="button" className="btn-secondary mt-1 px-3 py-1 text-xs" onClick={() => setConfirming({ ...paymentOf(row), late: true, reason: row.reason })}>Came after all — confirm</button>
              )}
            </li>
          );
        })}
      </ul>
      {confirming && <ConfirmPaymentDialog payment={confirming} onClose={() => setConfirming(null)} onDone={done} />}
      {rejecting && <NotInBankDialog payment={rejecting} onClose={() => setRejecting(null)} onDone={done} />}
    </section>
  );
}

/** The tasks a payment is logged from or asked about. */
export const RECEIPT_TASK_KINDS = ['team_payment_followup', 'prt_recovery', 'ac_clarify'];
