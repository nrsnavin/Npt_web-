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
 * `payment`: { receivableId, receiptId, amount, mode, reference, receivedAt, by, label }.
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
      const saved = await paymentsApi.confirmReceipt({
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
    <Modal open title="Confirm the payment" description={payment.label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-line/[0.04] px-3 py-2 text-sm text-steel-200">
          Logged: <span className="font-semibold">{formatCurrency(payment.amount)}</span>
          {payment.mode ? ` · ${String(payment.mode).toUpperCase()}` : ''}
          {payment.reference ? ` · ${payment.reference}` : ''}
          {payment.receivedAt ? ` · ${formatDate(payment.receivedAt)}` : ''}
          {payment.by ? ` · by ${payment.by}` : ''}
        </p>
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

/** Accounts did not find it in the bank: off the figures with the reason, and whoever logged it checks with the buyer. */
export function NotInBankDialog({ payment, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!payment) return null;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone?.(await paymentsApi.rejectReceipt({ id: payment.receivableId, receiptId: payment.receiptId, reason: reason.trim() }));
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
          {formatCurrency(payment.amount)}{payment.reference ? ` · ${payment.reference}` : ''} comes off the figures. {payment.by || 'Whoever logged it'} is asked to check with the buyer.
        </p>
        <Field label="What does the bank show?" required>
          <textarea className="input min-h-[5rem]" required minLength={3} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="No credit with this UTR up to today" />
        </Field>
        {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-danger" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : 'Mark not in the bank'}</button>
        </div>
      </form>
    </Modal>
  );
}
