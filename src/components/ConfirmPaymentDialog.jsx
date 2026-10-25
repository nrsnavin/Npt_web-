import { useState } from 'react';
import { payments as paymentsApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';
import { todayInIndia } from '../utils/taskForm.js';

/**
 * Accounts confirms a logged payment from the bank line [server: payment.controller
 * `confirmReceipt`]: the UTR (not for cash), the amount credited, the day, the account it came
 * into and a remark. The bank's amount and day are the ones kept. On confirming, the Payment
 * Collection task it was logged from closes and its team is told.
 *
 * `payment`: { receivableId, receiptId, amount, mode, reference, receivedAt, by, label, late }.
 * `late`: the payment was marked Not in bank and has come after all — confirmed on that same entry
 * [server: `confirmLateReceipt`], nobody logs it again.
 */
export function ConfirmPaymentDialog({ payment, onClose, onDone }) {
  const [values, setValues] = useState(() => ({
    reference: payment?.reference || '',
    amount: payment?.amount ? String(payment.amount) : '',
    creditedOn: todayInIndia(),
    bankAccount: '',
    note: '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!payment) return null;
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const cash = payment.mode === 'cash';
  const amount = Number(values.amount) || 0;
  const utrNeeded = !cash && !values.reference.trim();
  const differs = amount > 0 && Math.abs(amount - payment.amount) > 0.005;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await (payment.late ? paymentsApi.confirmLate : paymentsApi.confirmReceipt)({
        id: payment.receivableId,
        receiptId: payment.receiptId,
        reference: values.reference.trim() || undefined,
        amount,
        creditedOn: values.creditedOn,
        bankAccount: values.bankAccount.trim() || undefined,
        note: values.note.trim() || undefined,
      });
      onDone?.(saved);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={payment.late ? 'It came after all — confirm it' : 'Confirm the payment'} description={payment.label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-line/[0.04] px-3 py-2 text-sm text-steel-200">
          Logged: <span className="font-semibold">{formatCurrency(payment.amount)}</span>
          {payment.mode ? ` · ${String(payment.mode).toUpperCase()}` : ''}
          {payment.reference ? ` · ${payment.reference}` : ''}
          {payment.receivedAt ? ` · ${formatDate(payment.receivedAt)}` : ''}
          {payment.by ? ` · by ${payment.by}` : ''}
        </p>
        {payment.late && <p className="text-sm text-warn-400">Marked not in the bank{payment.reason ? ` (${payment.reason})` : ''}. Confirming it here closes the task it came from — nobody logs it again.</p>}
        <p className="text-sm text-steel-400">Check your bank statement and fill in what it shows.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={cash ? 'Cash receipt / voucher number' : 'UTR number'} hint={cash ? 'If there is one' : 'As on the bank statement'} required={!cash}>
            <input className="input" autoFocus required={!cash} value={values.reference} onChange={set('reference')} placeholder={cash ? 'RB-44' : 'UTR 4471900231'} />
          </Field>
          <Field label="Amount credited (₹)" hint={differs ? `Logged as ${formatCurrency(payment.amount)} — the bank amount is kept` : undefined} required>
            <input type="number" min="0.01" step="0.01" required className="input" value={values.amount} onChange={set('amount')} />
          </Field>
          <Field label="Date credited" required>
            <input type="date" required className="input" max={todayInIndia()} value={values.creditedOn} onChange={set('creditedOn')} />
          </Field>
          <Field label="Bank account" hint="Which account it came into">
            <input className="input" value={values.bankAccount} onChange={set('bankAccount')} placeholder="HDFC current a/c 1234" />
          </Field>
        </div>
        <Field label="Remarks">
          <input className="input" value={values.note} onChange={set('note')} placeholder="Bank charges, part of a bigger transfer…" />
        </Field>
        {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !amount || !values.creditedOn || utrNeeded}>
            {busy ? 'Confirming…' : 'Confirm payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Why a payment is not in the bank [server: models/Receivable.js `RECEIPT_REJECT_REASONS`]. */
export const NOT_IN_BANK_REASONS = [
  { key: 'not_received', label: 'Not received yet', hint: 'Nothing credited so far — can be confirmed later on the same entry' },
  { key: 'mismatch', label: 'UTR / amount mismatch', hint: 'A credit, but the UTR or amount does not match' },
  { key: 'bounced', label: 'Cheque bounced', hint: 'PRT is sent to collect a fresh cheque' },
];

/**
 * Accounts did not find it in the bank: which of the three reasons, and a note. The payment comes off
 * the figures; the Payment Collection or PRT task it came from reopens at Not in Bank — Recheck with
 * Buyer, and whoever logged it and the buyer's marketing person are told.
 */
export function NotInBankDialog({ payment, onClose, onDone }) {
  const [reasonKey, setReasonKey] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!payment) return null;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone?.(await paymentsApi.rejectReceipt({ id: payment.receivableId, receiptId: payment.receiptId, reasonKey, reason: reason.trim() || undefined }));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Not in the bank" description={payment.label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-steel-300">
          {formatCurrency(payment.amount)}{payment.reference ? ` · ${payment.reference}` : ''} comes off the figures. {payment.by || 'Whoever logged it'} and the buyer’s marketing person are told to recheck with the buyer.
        </p>
        <fieldset className="space-y-1.5" aria-label="Why it is not in the bank">
          <legend className="mb-1 text-sm font-semibold text-steel-200">Why?</legend>
          {NOT_IN_BANK_REASONS.map((row) => (
            <label key={row.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${reasonKey === row.key ? 'border-danger-500/50 bg-danger-500/[0.06]' : 'border-line/[0.08]'}`}>
              <input type="radio" name="reasonKey" className="mt-1" checked={reasonKey === row.key} onChange={() => setReasonKey(row.key)} />
              <span><span className="font-semibold text-steel-100">{row.label}</span><span className="block text-xs text-steel-400">{row.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <Field label="Note" hint="Optional — what the bank shows">
          <textarea className="input min-h-[4rem]" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="No credit with this UTR up to today" />
        </Field>
        {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-danger" disabled={busy || !reasonKey}>{busy ? 'Saving…' : 'Mark not in the bank'}</button>
        </div>
      </form>
    </Modal>
  );
}
