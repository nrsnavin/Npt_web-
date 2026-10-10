import { useCallback, useEffect, useState } from 'react';
import { orders as ordersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, FormError, Modal, Section } from './ui.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';
import { describePlan } from '../utils/paymentTerms.js';

/**
 * Money before work, on the order's payment terms [server: services/paymentGates.service.js]:
 * what must be in before production and before dispatch, what is in, and Admin's exception.
 */
const STAGES = [
  { key: 'production', label: 'Before production' },
  { key: 'dispatch', label: 'Before dispatch' },
];

export default function OrderPayment({ order }) {
  const { user, mayDelete } = useAuth();
  const isAdmin = mayDelete || user?.role === 'admin';
  const [standing, setStanding] = useState(null);
  const [waiving, setWaiving] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => ordersApi.payment(order._id).then(setStanding).catch(() => setStanding(null)), [order._id]);
  useEffect(() => {
    load();
  }, [load, order.updatedAt]);

  if (!standing) return null;
  const plan = order.paymentPlan || {};
  const asksNothing = !plan.advancePercent && !plan.beforeDispatchPercent;

  const waive = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStanding(await ordersApi.waivePayment({ id: order._id, stage: waiving, reason: reason.trim() }));
      setWaiving(null);
      setReason('');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Payment before work">
      <p className="text-sm text-steel-300">
        <span className="font-semibold text-steel-100">{describePlan(plan)}</span>
        {order.paymentTerms && order.paymentTerms !== describePlan(plan) && <span className="text-steel-500"> · “{order.paymentTerms}”</span>}
      </p>
      {asksNothing ? (
        <p className="mt-2 text-sm text-steel-500">Nothing is collected before production or dispatch on these terms.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {STAGES.map(({ key, label }) => {
            const row = standing[key];
            if (!row.percent) return null;
            const tone = row.met ? 'bg-success-500/15 text-success-400' : row.waived ? 'bg-warn-500/15 text-warn-400' : 'bg-danger-500/15 text-danger-400';
            const state = row.met ? 'Paid' : row.waived ? 'Allowed by Admin' : `${formatCurrency(row.short)} short`;
            return (
              <li key={key} className="rounded-lg border border-line/[0.08] px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-steel-100">{label} · {row.percent}%</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{state}</span>
                </div>
                <p className="mt-0.5 text-xs text-steel-400">
                  {formatCurrency(row.received)} of {formatCurrency(row.required)} received
                </p>
                {row.waived && row.waiver?.reason && (
                  <p className="mt-0.5 text-xs text-warn-400">“{row.waiver.reason}” · {formatDate(row.waiver.at)}</p>
                )}
                {!row.met && !row.waived && isAdmin && (
                  <button type="button" className="mt-2 text-xs font-semibold text-accent hover:underline" onClick={() => setWaiving(key)}>
                    Allow without the payment…
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(waiving)}
        title={waiving === 'production' ? 'Start production without the advance' : 'Dispatch without the payment'}
        description={`${order.number} — recorded on the order with your name and the reason`}
        onClose={() => setWaiving(null)}
      >
        <form onSubmit={waive} className="space-y-4">
          <Field label="Why" required>
            <textarea rows={3} className="input" autoFocus placeholder="MD cleared on the phone — cheque on Monday" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <FormError error={error} />
          <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={() => setWaiving(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || reason.trim().length < 5}>
              {busy ? 'Saving…' : 'Allow it'}
            </button>
          </div>
        </form>
      </Modal>
    </Section>
  );
}
