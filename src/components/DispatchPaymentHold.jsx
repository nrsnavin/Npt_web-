import { useState } from 'react';
import { Link } from 'react-router-dom';
import { payments as paymentsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Field, FormError, Modal } from './ui.jsx';
import { formatCurrency } from '../utils/format.js';
import { todayInIndia } from '../utils/taskForm.js';
import { NotInBankBanner } from './NotInBank.jsx';

/**
 * Goods ready, the dispatch held for the money due before it [server: paymentGates.service
 * `dispatchHoldsOn`] — on the enquiry, where its marketing person sees it: what is due, what is
 * in, what is logged and waiting for Accounts, who is chasing it, and the receipt. The marketing
 * person enters the payment the buyer made; it waits for Accounts to see it in the bank, and once
 * confirmed Dispatch gets the request by itself.
 */

const MODES = [['neft', 'NEFT'], ['rtgs', 'RTGS'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['cash', 'Cash']];

function EnterPayment({ hold, onClose, onSaved }) {
  const { toast } = useToast();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const due = Math.max(0, Math.round((hold.short - (hold.awaiting || 0)) * 100) / 100);
  const [values, setValues] = useState({ amount: due ? String(due) : '', mode: 'neft', reference: '', receivedAt: todayInIndia(), note: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const amount = Number(values.amount) || 0;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await paymentsApi.ownerReceipt({
        id: hold.receivable._id, idempotencyKey, amount, mode: values.mode,
        reference: values.reference.trim() || undefined, receivedAt: values.receivedAt || undefined, note: values.note.trim() || undefined,
      });
      toast('Payment entered', 'Accounts confirms it in the bank — Dispatch gets the request once it is confirmed.');
      onSaved();
      onClose();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Payment received — ${hold.order.number}`} description={`${formatCurrency(hold.short)} still due before dispatch`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="How much" required><input type="number" min="1" step="0.01" className="input" required value={values.amount} onChange={set('amount')} /></Field>
          <Field label="How it came">
            <select className="input" value={values.mode} onChange={set('mode')}>{MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </Field>
          <Field label="UTR / cheque number" hint="So Accounts can find it in the bank"><input className="input" value={values.reference} maxLength={80} placeholder="UTR 4471900231" onChange={set('reference')} /></Field>
          <Field label="Paid on"><input type="date" className="input" max={todayInIndia()} value={values.receivedAt} onChange={set('receivedAt')} /></Field>
        </div>
        <Field label="Note"><input className="input" value={values.note} maxLength={300} placeholder="Buyer sent the UTR on WhatsApp" onChange={set('note')} /></Field>
        <p className="text-xs text-steel-400">Entered here it waits for Accounts to see it in the bank; the goods go once they confirm.</p>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || amount <= 0}>{busy ? 'Saving…' : 'Enter payment'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DispatchPaymentHold({ holds = [], mayEnter, onChanged }) {
  const { canRead } = useAuth();
  const [entering, setEntering] = useState(null);
  if (!holds.length) return null;
  return (
    <div className="space-y-2" aria-label="Dispatch held for payment">
      {holds.map((hold) => {
        /* All of it logged: nothing more to enter, only Accounts' confirmation to wait for. */
        const logged = hold.awaiting > 0 && hold.awaiting + 0.5 >= hold.short;
        return (
        <div key={hold.order._id} className={`rounded-xl border px-3 py-2.5 ${logged ? 'border-aqua-500/40 bg-aqua-500/[0.06]' : 'border-warn-500/50 bg-warn-500/[0.08]'}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 text-sm text-steel-100">
              <p className={`font-bold ${logged ? 'text-aqua-300' : 'text-warn-400'}`}>{logged ? 'Goods ready — payment entered, waiting for Accounts to confirm' : 'Goods ready — payment awaited to send'}</p>
              <p className="text-steel-200">
                <Link to={`/orders/${hold.order._id}`} className="font-semibold hover:text-accent">{hold.order.number}</Link>
                {hold.order.paymentTerms ? <span className="text-steel-400"> · {hold.order.paymentTerms}</span> : null}
                {hold.models?.length ? <span className="text-steel-400"> · ready: {hold.models.join(', ')}</span> : null}
              </p>
              <p className="text-xs text-steel-300">
                {formatCurrency(hold.required)} before dispatch · {formatCurrency(hold.received)} confirmed · <span className="font-semibold text-warn-400">{formatCurrency(hold.short)} to come</span>
                {hold.awaiting > 0 && <span className="text-aqua-300"> · {formatCurrency(hold.awaiting)} logged, waiting for Accounts to confirm</span>}
              </p>
              {hold.chase && !logged && <p className="text-xs text-steel-400">Payment Collection is chasing it{hold.chase.with && hold.chase.with !== 'Payment Collection' ? ` (${hold.chase.with})` : ''}.</p>}
              {logged && <p className="text-xs text-steel-400">Dispatch gets the request as soon as Accounts confirms it in the bank.</p>}
              {/* Logged, and Accounts did not find it: red, with why [NotInBankBanner]. */}
              {hold.notInBank?.length > 0 && <div className="mt-1.5"><NotInBankBanner rows={hold.notInBank} compact /></div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hold.receivable && canRead('payments') && <Link to={`/payments/${hold.receivable._id}`} className="row-action text-xs">Payment receipt {hold.receivable.number}</Link>}
              {hold.receivable && mayEnter && !logged && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setEntering(hold)}>Enter payment received</button>}
            </div>
          </div>
        </div>
        );
      })}
      {entering && <EnterPayment hold={entering} onClose={() => setEntering(null)} onSaved={onChanged} />}
    </div>
  );
}
