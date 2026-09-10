import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { payments as paymentsApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import FollowUpForm from '../components/FollowUp.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * One thing owed [BLUEPRINT §20, §25].
 *
 * The screen is built around the conversation rather than the arithmetic, because the
 * arithmetic is three numbers and the conversation is why the money has or has not arrived.
 * So the follow-up log is the main column and the invoice sits beside it as reference.
 *
 * Three decisions worth naming:
 *
 * **The order's position is shown beside this invoice**, with advances netted off. The number a
 * buyer quotes back on the phone is what they owe on the *order*, not on one document — and a
 * chaser working from a single invoice while the buyer works from the order total is a call
 * that goes nowhere. The server does the netting, because an advance against an order later
 * invoiced in full is not an additional debt and summing the balances would say it was.
 *
 * **A receipt is accounts' to record, a follow-up is anybody's.** Not a seniority distinction:
 * a receipt is a claim about a bank account, and the person who can look at the bank account
 * should be the one making it. Marketing told "we paid Tuesday" logs that as what it is —
 * something they were told.
 *
 * **Disputed and on hold are the only two states a person sets.** Everything else is what the
 * dates and the receipts say. Both stop the escalation ladder, and the screen says so, because
 * a chaser who marks something disputed to get it off their list should know that is exactly
 * what it does.
 */

const STATE_LABELS = {
  paid: 'Paid',
  part_paid: 'Part paid',
  overdue: 'Overdue',
  due_today: 'Due today',
  due_soon: 'Due soon',
  not_due: 'Not due yet',
  disputed: 'Disputed',
  on_hold: 'On hold',
};

const MODES = [
  { value: 'neft', label: 'NEFT' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'other', label: 'Other' },
];

/* -------------------------------- Money in -------------------------------- */

function ReceiptForm({ receivable, onClose, onSaved }) {
  const { toast } = useToast();
  const [values, setValues] = useState({
    amount: '', mode: 'neft', reference: '', receivedAt: '', note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });
  const amount = Number(values.amount) || 0;
  /* The server refuses this too; saying it here first stops somebody pressing a button that
     was always going to come back with an error. */
  const tooMuch = amount > (receivable?.balance || 0);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await paymentsApi.receipt({
          id: receivable._id,
          amount,
          mode: values.mode,
          reference: values.reference.trim() || undefined,
          receivedAt: values.receivedAt || undefined,
          note: values.note.trim() || undefined,
        })
      );
      /* Says what is left, because that is the number the next call is about. */
      const left = receivable.balance - amount;
      toast(
        `${formatCurrency(amount)} recorded`,
        left > 0 ? `${formatCurrency(left)} still owed on this one` : 'Settled in full'
      );
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(receivable)}
      title="Money in"
      description={receivable ? `${formatCurrency(receivable.balance)} outstanding` : undefined}
      onClose={onClose}
    >
      {receivable && (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="How much"
              error={tooMuch ? 'More than is owed on this one' : undefined}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                autoFocus
                value={values.amount}
                onChange={set('amount')}
              />
            </Field>
            <Field label="How it came">
              <select className="input" value={values.mode} onChange={set('mode')}>
                {MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference" hint="UTR or cheque number — so it can be found again">
              <input className="input" placeholder="UTR 4471900231" value={values.reference} onChange={set('reference')} />
            </Field>
            <Field label="When" hint="Leave blank for today">
              <input type="date" className="input" value={values.receivedAt} onChange={set('receivedAt')} />
            </Field>
          </div>

          {/*
            One receipt lands against one receivable. A single NEFT settling three invoices is
            three receipts, and saying so here is cheaper than somebody discovering it by
            typing the whole transfer against the first invoice they opened.
          */}
          {amount > 0 && amount < receivable.balance && (
            <Notice tone="info">
              <p>
                {formatCurrency(receivable.balance - amount)} will still be owed on this one. If
                the transfer covered other invoices too, record the rest against each of them.
              </p>
            </Notice>
          )}

          {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

          <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !amount || tooMuch}>
              {busy ? 'Saving…' : 'Record it'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------- The judgement ------------------------------- */

function JudgementForm({ receivable, onClose, onSaved }) {
  const { toast } = useToast();
  const [judgement, setJudgement] = useState(receivable?.judgement || 'disputed');
  const [note, setNote] = useState(receivable?.judgementNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await paymentsApi.judgement({ id: receivable._id, judgement, note: note.trim() }));
      toast(
        judgement === 'disputed' ? 'Marked disputed' : 'Put on hold',
        'Nobody is chased or reminded while this stands'
      );
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await paymentsApi.judgement({ id: receivable._id }));
      toast('Cleared — this is being chased again');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(receivable)}
      title="Put it on hold"
      description="Nobody is chased while this stands"
      onClose={onClose}
    >
      {receivable && (
        <form onSubmit={submit} className="space-y-4">
          <Notice tone="warn">
            <p>
              The escalation ladder stops. Nobody is reminded, and nothing about this reaches
              management, until it is cleared — chasing a buyer for money they are arguing about
              turns a commercial disagreement into a relationship one.
            </p>
          </Notice>

          <Field label="Which is it?">
            <select className="input" value={judgement} onChange={(event) => setJudgement(event.target.value)}>
              <option value="disputed">Disputed — the buyer is arguing about it</option>
              <option value="on_hold">On hold — we have agreed to wait</option>
            </select>
          </Field>

          <Field label="Why" hint="Somebody will read this instead of ringing you">
            <textarea
              rows={3}
              className="input"
              autoFocus
              placeholder="Short by 400 pieces on their count. Warehouse is recounting."
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line/[0.06] pt-4">
            {/* Clearing returns it to whatever the dates say rather than to a remembered
                status, and restarts the ladder from where it now stands — so a month in
                dispute does not fire four tiers the moment it is released. */}
            {receivable.judgement && (
              <button type="button" className="btn-secondary mr-auto" onClick={clear} disabled={busy}>
                Clear it — start chasing again
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || note.trim().length < 5}>
              {busy ? 'Saving…' : 'Hold it'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* --------------------------------- The page --------------------------------- */

const fetch = (id) => paymentsApi.get(id);

export default function PaymentDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const { data, setData, loading, error, reload } = useRecord(fetch, id);

  const [calling, setCalling] = useState(false);
  const [receipting, setReceipting] = useState(false);
  const [judging, setJudging] = useState(false);

  if (loading) return <Spinner label="Loading" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.data) return null;

  const receivable = data.data;
  const position = data.order;
  /* Accounts writes receipts and judgements; marketing may log a call. */
  const mayWrite = canWrite('payments');

  const absorb = (next) => setData({ ...data, data: next.data ?? next });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={receivable.invoice?.number || receivable.number}
        subtitle={
          <>
            <Link to={`/customers/${receivable.customer?._id}`} className="hover:text-accent">
              {receivable.customer?.name}
            </Link>
            {receivable.order?.number ? (
              <>
                {' · '}
                <Link to={`/orders/${receivable.order._id}`} className="hover:text-accent">
                  {receivable.order.number}
                </Link>
              </>
            ) : null}
            {receivable.kind === 'advance' ? ' · advance' : ''}
          </>
        }
        actions={
          <Badge status={receivable.state}>{STATE_LABELS[receivable.state] || receivable.state}</Badge>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* The three numbers, and no more. Invoiced, in, still owed. */}
          <Section title="Where it stands">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: receivable.kind === 'advance' ? 'Advance due' : 'Invoiced', value: receivable.invoice?.value },
                { label: 'Received', value: receivable.received },
                { label: 'Still owed', value: receivable.balance, lit: receivable.balance > 0 },
              ].map((tile) => (
                <div key={tile.label}>
                  <p className="eyebrow">{tile.label}</p>
                  <p className={`stat-value mt-1 ${tile.lit ? 'text-danger-400' : 'text-steel-50'}`}>
                    {formatCurrency(tile.value)}
                  </p>
                </div>
              ))}
            </div>

            {receivable.judgement && (
              <Notice tone="warn">
                <p>
                  <span className="font-bold">
                    {receivable.judgement === 'disputed' ? 'Disputed' : 'On hold'}:
                  </span>{' '}
                  {receivable.judgementNote}
                </p>
                <p className="mt-1 text-xs">Nobody is being chased or reminded while this stands.</p>
              </Notice>
            )}

            {/* The standing promise, and whether it has been broken — the single thing that
                most changes how the next call opens. */}
            {receivable.promise && (
              <Notice tone={receivable.promise.broken ? 'danger' : 'info'}>
                <p>
                  {receivable.promise.broken ? 'Promised ' : 'Promised '}
                  <span className="font-bold">{formatDate(receivable.promise.date)}</span>
                  {receivable.promise.spokeTo ? ` by ${receivable.promise.spokeTo}` : ''}
                  {receivable.promise.amount ? ` · ${formatCurrency(receivable.promise.amount)}` : ''}
                  {receivable.promise.broken ? ' — and the day has gone.' : '.'}
                </p>
              </Notice>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line/[0.06] pt-4">
              <button type="button" className="btn-primary" onClick={() => setCalling(true)}>
                Log a call
              </button>
              {mayWrite && receivable.balance > 0 && (
                <button type="button" className="btn-secondary" onClick={() => setReceipting(true)}>
                  Money in
                </button>
              )}
              {mayWrite && (
                <button type="button" className="btn-ghost" onClick={() => setJudging(true)}>
                  {receivable.judgement ? 'Change the hold' : 'Dispute or hold'}
                </button>
              )}
            </div>
          </Section>

          {/*
            The chase itself, newest first. The main column because it is the thing this screen
            is for: the arithmetic above is three numbers and never in question, and what
            actually decides the next call is what was said last time.
          */}
          <Section title="The chase">
            {receivable.followUps?.length ? (
              <ol className="space-y-3">
                {[...receivable.followUps]
                  .sort((a, b) => new Date(b.at) - new Date(a.at))
                  .map((entry) => (
                    <li key={entry._id} className="rounded-lg border border-line/[0.08] p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-bold text-steel-100">
                          {entry.by?.name || 'Somebody'}
                          {entry.spokeTo ? ` → ${entry.spokeTo}` : ''}
                        </p>
                        <p className="text-xs text-steel-500">{formatDate(entry.at)}</p>
                      </div>
                      <p className="mt-1 text-sm text-steel-200">{entry.note}</p>
                      {entry.promisedDate && (
                        <p className="mt-1.5 text-xs font-semibold text-warn-400">
                          Promised {formatDate(entry.promisedDate)}
                          {entry.promisedAmount ? ` · ${formatCurrency(entry.promisedAmount)}` : ''}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-sm text-steel-500">
                Nobody has rung them about this yet. A call logged here is what the next person
                to ring will read first.
              </p>
            )}
          </Section>

          <Section title="Money in">
            {receivable.receipts?.length ? (
              <ol className="space-y-2">
                {[...receivable.receipts]
                  .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
                  .map((receipt) => (
                    <li
                      key={receipt._id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-line/[0.08] px-3 py-2"
                    >
                      <span className="text-sm font-bold tabular-nums text-steel-100">
                        {formatCurrency(receipt.amount)}
                      </span>
                      <span className="text-xs text-steel-400">
                        {(receipt.mode || '').toUpperCase()}
                        {receipt.reference ? ` · ${receipt.reference}` : ''}
                        {' · '}
                        {formatDate(receipt.receivedAt)}
                        {receipt.recordedBy?.name ? ` · ${receipt.recordedBy.name}` : ''}
                      </span>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-sm text-steel-500">Nothing has come in against this one.</p>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          {/*
            The order's whole position, with advances netted. A chaser working from one invoice
            while the buyer works from the order total is a call that goes nowhere.
          */}
          {position && (
            <Section title="The order, altogether">
              <Facts
                columns={1}
                items={[
                  { label: 'Invoiced', value: formatCurrency(position.invoiced) },
                  { label: 'Received', value: formatCurrency(position.received) },
                  { label: 'Outstanding', value: formatCurrency(position.outstanding) },
                  position.awaitingAdvance
                    ? { label: 'Advance not in yet', value: formatCurrency(position.awaitingAdvance) }
                    : null,
                  { label: 'Documents', value: `${position.receivables} on this order` },
                ].filter(Boolean)}
              />
              <p className="mt-3 border-t border-line/[0.06] pt-3 text-xs text-steel-500">
                Advances are netted against what was invoiced rather than added to it — money
                taken early is not a second debt.
              </p>
            </Section>
          )}

          <Section title="The paperwork">
            <Facts
              columns={1}
              items={[
                  { label: 'Reference', value: receivable.number },
                  { label: 'Invoice', value: receivable.invoice?.number },
                  { label: 'Invoice date', value: formatDate(receivable.invoice?.date) },
                  { label: 'Due by', value: formatDate(receivable.dueBy) },
                  { label: 'Terms', value: receivable.customer?.paymentTerms },
                  { label: 'Owner', value: receivable.assignedTo?.name },
                  { label: 'Mobile', value: receivable.customer?.mobile },
                  receivable.dispatch?.number
                    ? { label: 'Went on', value: `${receivable.dispatch.number} · LR ${receivable.dispatch.lrNumber || '—'}` }
                    : null,
              ].filter(Boolean)}
            />
          </Section>

          <HistoryPanel model="Receivable" id={receivable._id} refreshKey={receivable.updatedAt} />
        </div>
      </div>

      <FollowUpForm
        receivable={calling ? receivable : null}
        onClose={() => setCalling(false)}
        onSaved={(next) => { setCalling(false); absorb(next); }}
      />
      <ReceiptForm
        receivable={receipting ? receivable : null}
        onClose={() => setReceipting(false)}
        onSaved={(next) => { setReceipting(false); absorb(next); reload(); }}
      />
      <JudgementForm
        receivable={judging ? receivable : null}
        onClose={() => setJudging(false)}
        onSaved={(next) => { setJudging(false); absorb(next); }}
      />
    </div>
  );
}
