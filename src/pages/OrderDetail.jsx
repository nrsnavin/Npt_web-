import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orders as ordersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import OrderQueries from '../components/OrderQueries.jsx';
import DispatchTracker from '../components/DispatchTracker.jsx';
import { ProductionLineDialog } from '../components/ProductionLine.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_ORDER_STAGES, PRE_RELEASE_STAGES, orderStageLabel, productionStageLabel,
} from '../utils/pipeline.js';

/**
 * One sales order [BLUEPRINT §12–13].
 *
 * The screen is built around the gate. §13 says eight things must be true before anything is
 * released, so the checklist is not a panel down the side — it is the first thing on the page
 * whenever the order is still in front of the gate, and it disappears into the record once the
 * order has gone past it.
 *
 * Three decisions the layout is making, each of them about the gate rather than about looks.
 *
 * **The eight are ticked here, one at a time, and each shows who ticked it.** That is the whole
 * argument for the checklist being a record rather than a boolean: when an order ships in the
 * wrong colour, the question is which check was skipped and by whom.
 *
 * **Release is drawn even while it is refused**, carrying what is still outstanding. A button
 * that appears only when it will work hides the thing the person is working towards; one that
 * says "still needs the packing confirmed" tells them how far they have got.
 *
 * **After release the checklist goes read-only and says so.** The checks describe a decision
 * taken before the plant started, and a screen that still offered a checkbox would be offering
 * to rewrite the reason a running job was allowed to run.
 */

const rupees = (value) => (value === undefined || value === null ? '—' : formatCurrency(value));

/* --------------------------------- The gate --------------------------------- */

function Checklist({ order, checks, onChanged, mayWrite }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  /*
   * The same rule the server holds: the checks are editable only while the order is in front
   * of the gate. Past it they are a record of a decision already taken, and offering a checkbox
   * would be offering to rewrite the reason a running job was allowed to run.
   */
  const frozen = !PRE_RELEASE_STAGES.includes(order.status);

  const toggle = async (check) => {
    setBusy(check.key);
    setError(null);
    try {
      onChanged(await ordersApi.setCheck({ id: order._id, check: check.key, done: !check.done }));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(null);
    }
  };

  const done = checks.filter((check) => check.done).length;

  return (
    <Section
      title="Before it goes to production"
      actions={
        <span className={`text-xs tabular-nums ${done === 8 ? 'text-success-400' : 'text-warn-400'}`}>
          {done} of {checks.length}
        </span>
      }
    >
      {frozen && (
        <Notice tone="info">
          Released on {formatDate(order.releasedAt)}. These are the checks that were made then,
          and they stay as they were &mdash; the plant has been running against them since.
        </Notice>
      )}

      <ul className="mt-3 space-y-1">
        {checks.map((check) => (
          <li key={check.key}>
            <button
              type="button"
              disabled={frozen || !mayWrite || busy === check.key}
              onClick={() => toggle(check)}
              className={`flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                frozen || !mayWrite ? 'cursor-default' : 'hover:bg-line/[0.04]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-[1.05rem] w-[1.05rem] flex-none items-center justify-center rounded border text-[0.7rem] font-bold ${
                  check.done
                    ? 'border-success-500/60 bg-success-500/15 text-success-400'
                    : 'border-line/20 text-transparent'
                }`}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${check.done ? 'text-steel-100' : 'text-steel-300'}`}>
                  {check.label}
                </span>
                <span className="block text-xs text-steel-500">
                  {/* Once ticked, when — the trail is the point of the checklist. */}
                  {check.done ? `Checked ${formatDate(check.at)}` : check.hint}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
        </Notice>
      )}
    </Section>
  );
}

/* -------------------------------- The actions -------------------------------- */

function OrderActions({ order, onDone }) {
  const [actions, setActions] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /*
   * Loaded on arrival rather than behind a button, and re-loaded whenever the status moves —
   * what can be done from `po_received` is not what can be done from `approved_for_production`,
   * and a stale list offers an action the server will refuse.
   */
  useEffect(() => {
    let live = true;
    ordersApi
      .actions(order._id)
      /* A list that will not load must not block the page; the buttons simply do not appear. */
      .then((next) => live && setActions(next))
      .catch(() => live && setActions([]));
    return () => {
      live = false;
    };
  }, [order._id, order.status, order.outstandingChecks?.length]);

  const run = async (action) => {
    if (action.needs.length) {
      setChosen(action);
      setValues({});
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await ordersApi.act({ id: order._id, action: action.action }));
    } catch (actError) {
      setError(actError);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await ordersApi.act({ id: order._id, action: chosen.action, ...values }));
      setChosen(null);
    } catch (actError) {
      setError(actError);
    } finally {
      setBusy(false);
    }
  };

  if (CLOSED_ORDER_STAGES.includes(order.status)) return null;

  return (
    <Section title="What happens next">
      {!actions ? (
        <p className="text-sm text-steel-500">Loading…</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {actions.map((action) => (
            <button
              key={action.action}
              type="button"
              disabled={busy || Boolean(action.blockedBy)}
              onClick={() => run(action)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                action.blockedBy
                  ? 'cursor-not-allowed border-line/[0.06] opacity-60'
                  : 'border-line/[0.1] hover:border-accent/40 hover:bg-line/[0.03]'
              }`}
            >
              <p className="text-sm font-semibold text-steel-100">{action.label}</p>
              <p className="mt-0.5 text-xs text-steel-500">{action.hint}</p>
              {/*
                The gate, said out loud. Hiding this button until the last box is ticked hides
                the thing the person is working towards.
              */}
              {action.blockedBy && (
                <p className="mt-1.5 text-xs font-semibold text-warn-400">{action.blockedBy}</p>
              )}
              {!action.blockedBy && action.raises && (
                <p className="mt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-aqua-300">
                  → {action.raises}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
        </Notice>
      )}

      <Modal
        open={Boolean(chosen)}
        title={chosen?.label}
        description={chosen?.hint}
        onClose={() => setChosen(null)}
      >
        <form onSubmit={submit} className="space-y-4">
          {/*
            Only what this action declares it cannot be done without. The alternative — every
            field on every move — is the form the server then refuses.
          */}
          {chosen?.needs.map((need) => (
            <Field
              key={need}
              label={need === 'cancellationReason' ? 'Why is it cancelled?' : 'What needs clarifying?'}
            >
              <textarea
                rows={3}
                className="input"
                autoFocus
                value={values[need] || ''}
                onChange={(event) => setValues({ ...values, [need]: event.target.value })}
              />
            </Field>
          ))}

          <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={() => setChosen(null)}>Cancel</button>
            <button
              type="submit"
              className={chosen?.action === 'cancel' ? 'btn-danger' : 'btn-primary'}
              disabled={busy || chosen?.needs.some((need) => !values[need]?.trim())}
            >
              {busy ? 'Saving…' : chosen?.label}
            </button>
          </div>
        </form>
      </Modal>
    </Section>
  );
}

/* ------------------------------- The PO upload ------------------------------- */

function PurchaseOrder({ order, onSaved, mayWrite }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await ordersApi.setPo(order._id, file));
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const attached = order.customerPo?.attachment;

  return (
    <Section title="The customer's purchase order">
      <dl className="space-y-3 text-sm">
        <Facts
          items={[
            { label: 'PO number', value: order.customerPo?.number },
            { label: 'Dated', value: order.customerPo?.date && formatDate(order.customerPo.date) },
          ]}
        />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {attached ? (
          <a
            className="text-sm font-semibold text-accent hover:underline"
            href={`/api/files/${attached.key}`}
            target="_blank"
            rel="noreferrer"
          >
            {attached.filename || 'Open the PO'}
          </a>
        ) : (
          /*
            §13's first check is that the PO has been *received*, and a tick against a document
            nobody can open is a tick against a phone call.
          */
          <p className="text-sm text-warn-400">Not attached yet</p>
        )}

        {mayWrite && (
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? 'Uploading…' : attached ? 'Replace it' : 'Attach the PO'}
            </button>
            <input
              ref={input}
              type="file"
              className="hidden"
              accept=".pdf,image/*"
              onChange={upload}
            />
          </>
        )}
      </div>

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
    </Section>
  );
}

/* --------------------------------- The page --------------------------------- */

export default function OrderDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();

  const fetch = useCallback((orderId) => ordersApi.get(orderId), []);
  const { data, setData, loading, error, reload } = useRecord(fetch, id);
  /** Which line the plant is recording against, if any. */
  const [recording, setRecording] = useState(null);

  if (loading) return <Spinner label="Loading the order" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.data) return null;

  const order = data.data;
  const checks = data.checks || [];
  const mayWrite = canWrite('orders');
  const mayRecord = canWrite('production');
  /* The plant only exists on this screen once the order has passed the §13 gate. */
  const released = !PRE_RELEASE_STAGES.includes(order.status) && order.status !== 'cancelled';

  /** A reply from a check or an action carries the whole order back; keep the checklist too. */
  const absorb = (next) => setData({ ...data, data: next.data ?? next, checks: next.checks ?? checks });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={order.number}
        subtitle={
          <>
            <Link to={`/customers/${order.customer?._id}`} className="hover:text-accent">
              {order.customer?.name}
            </Link>
            {' · '}
            {formatNumber(order.orderedQty)} pcs
            {order.customerPo?.number ? ` · ${order.customerPo.number}` : ''}
          </>
        }
        actions={<Badge status={order.status}>{orderStageLabel(order.status)}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Section title="What was ordered">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2.5">Model</th>
                    <th className="px-3 py-2.5">Colour</th>
                    <th className="px-3 py-2.5 text-right">Ordered</th>
                    {/* The plant's answer sits beside what was asked for, once there is one. */}
                    {released && <th className="px-3 py-2.5 text-right">Made</th>}
                    {released && <th className="px-3 py-2.5">Where it is</th>}
                    {!order.valueHidden && <th className="px-3 py-2.5 text-right">Rate</th>}
                    <th className="px-3 py-2.5">Wanted by</th>
                    {released && mayRecord && <th className="px-3 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {order.lines.map((line) => (
                    <tr key={line._id}>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-steel-100">
                          {line.modelNumber || line.mould?.mouldCode || '—'}
                        </p>
                        <p className="text-[0.6875rem] text-steel-500" title={line.mould?.name}>
                          {/*
                            The tool's code, not its name. No mould is a traded piece rather than
                            a gap [§28] — but once production sits in the columns beside this one
                            the name wraps to five lines, and the code is what identifies it. The
                            name is a tooltip, and the register is a click away.
                          */}
                          {line.mould ? line.mould.mouldCode : 'Bought in'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-steel-300">{line.colour || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                        {formatNumber(line.quantity)}
                      </td>
                      {released && (
                        <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                          {formatNumber(line.production?.producedQty || 0)}
                          {line.toMakeQty > 0 && (
                            <p className="text-[0.6875rem] text-steel-500">
                              {formatNumber(line.toMakeQty)} to go
                            </p>
                          )}
                        </td>
                      )}
                      {released && (
                        <td className="px-3 py-3">
                          <Badge status={line.production?.status}>
                            {productionStageLabel(line.production?.status)}
                          </Badge>
                          {/* Late means past the agreed date *and* still owing pieces. */}
                          {line.isOverdue && (
                            <p className="mt-1 text-[0.6875rem] font-semibold text-danger-400">Late</p>
                          )}
                          {line.production?.holdReason && (
                            <p className="mt-1 max-w-[12rem] truncate text-[0.6875rem] text-danger-400">
                              {line.production.holdReason}
                            </p>
                          )}
                        </td>
                      )}
                      {!order.valueHidden && (
                        <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                          {rupees(line.unitPrice)}
                        </td>
                      )}
                      <td className="px-3 py-3 text-steel-300">
                        {line.deliveryDate ? formatDate(line.deliveryDate) : '—'}
                      </td>
                      {released && mayRecord && (
                        <td className="px-3 py-3">
                          <button type="button" className="row-action" onClick={() => setRecording(line)}>
                            Record
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {order.valueHidden ? (
              /*
                Said out loud rather than left as an empty column. A reader who cannot see the
                money should know that is a rule, not a record with nothing in it.
              */
              <p className="mt-3 border-t border-line/[0.06] pt-3 text-xs text-steel-500">
                Rates and totals are not shown on this screen for your department.
              </p>
            ) : (
              <div className="mt-3 flex justify-end gap-6 border-t border-line/[0.06] pt-3 text-sm">
                <span className="text-steel-400">Before tax</span>
                <span className="tabular-nums font-semibold text-steel-100">{rupees(order.netValue)}</span>
              </div>
            )}
          </Section>

          {/*
            Where the goods are [§19]. Only once the order has passed the gate — before it,
            there is nothing made, nothing packed and nothing to track, and a panel reading
            "0 packed, 0 gone" would be four zeroes pretending to be information.
          */}
          {released && <DispatchTracker order={order} />}

          <OrderActions order={order} onDone={absorb} />

          {/*
            The questions, on the order rather than in somebody's phone. Placed in the main
            column and above the history, because an unanswered question is work outstanding
            and the history is a record of work already done.
          */}
          <OrderQueries order={order} />

          <Section title={`History (${order.statusHistory?.length || 0})`}>
            <ol className="space-y-3">
              {[...(order.statusHistory || [])].reverse().map((entry, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-line/30" />
                  <div>
                    <p className="text-steel-200">{orderStageLabel(entry.to)}</p>
                    <p className="text-xs text-steel-500">
                      {formatDate(entry.at)}
                      {entry.by?.name ? ` · ${entry.by.name}` : ''}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="space-y-5">
          <Checklist order={order} checks={checks} onChanged={absorb} mayWrite={mayWrite} />

          <PurchaseOrder order={order} onSaved={(next) => absorb({ data: next })} mayWrite={mayWrite} />

          <Section title="Where it came from">
            <dl className="space-y-3 text-sm">
              <Facts
                columns={1}
                items={[
                  {
                    label: 'Quotation',
                    value: order.quotation?._id ? (
                      <Link to={`/quotations/${order.quotation._id}`} className="hover:text-accent">
                        {order.quotation.number}
                      </Link>
                    ) : null,
                  },
                  {
                    label: 'Enquiry',
                    value: order.enquiry?._id ? (
                      <Link to={`/enquiries/${order.enquiry._id}`} className="hover:text-accent">
                        {order.enquiry.number}
                      </Link>
                    ) : null,
                  },
                  { label: 'Owner', value: order.assignedTo?.name },
                  { label: 'Payment terms', value: order.paymentTerms },
                ]}
              />
            </dl>
          </Section>

          <HistoryPanel model="SalesOrder" id={order._id} />
        </div>
      </div>

      <ProductionLineDialog
        order={order}
        line={recording}
        onClose={() => setRecording(null)}
        onSaved={(next) => {
          setRecording(null);
          /* The reply carries the whole order back, roll-up and all. */
          absorb(next);
        }}
      />
    </div>
  );
}
