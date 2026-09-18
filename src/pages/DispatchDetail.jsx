import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, FormError, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import DeliveryAddress from '../components/DeliveryAddress.jsx';
import OverrideNotices from '../components/OverrideNotices.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import { DispatchActionsPanel } from '../components/DispatchStatus.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_DISPATCH_STAGES, GONE_DISPATCH_STAGES, PRE_LOAD_DISPATCH_STAGES,
  dispatchStageLabel, text,
} from '../utils/pipeline.js';

/**
 * One consignment [BLUEPRINT §18–19].
 *
 * The screen is built around §19's gate, the same way the order screen is built around §13's.
 * Marketing is promised the invoice, the LR, the transporter and the date the moment a lorry
 * leaves, so the paperwork panel is the first thing on the page and the action that dispatches
 * is drawn *disabled with what is missing* rather than hidden until it would work.
 *
 * Two consequences worth stating, because both are the screen refusing to be helpful in a way
 * that would cost something:
 *
 * **The load is read-only once the lorry is loaded.** A quantity edited after the fact is either
 * a correction that should be visible or a fiction, so the correction is a cancel and a
 * re-raise — which leaves both facts on the record.
 *
 * **The POD upload only appears once the goods have gone.** A proof of delivery filed against a
 * consignment still in the packing hall is a proof of nothing, and the server refuses it.
 */

const rupees = (value) => (value === undefined || value === null ? '—' : formatCurrency(value));

/* ------------------------------- The paperwork ------------------------------- */

/**
 * The four fields §19 turns on, edited in place.
 *
 * In place rather than behind a dialog because they arrive one at a time over a day — the
 * invoice in the morning, the LR when the lorry is loaded, the vehicle when it turns up — and
 * a form that had to be opened, filled and submitted for each would be a form somebody fills in
 * once at the end from memory.
 */
function Paperwork({ dispatch, outstanding, onSaved, mayWrite }) {
  const [values, setValues] = useState({
    invoiceNumber: dispatch.invoice?.number || '',
    invoiceDate: dispatch.invoice?.date?.slice(0, 10) || '',
    invoiceValue: dispatch.invoice?.value ?? '',
    lrNumber: dispatch.lrNumber || '',
    ewayBillNumber: dispatch.ewayBillNumber || '',
    transporter: dispatch.transporter || '',
    vehicleNumber: dispatch.vehicleNumber || '',
    expectedDeliveryDate: dispatch.expectedDeliveryDate
      ? dispatch.expectedDeliveryDate.slice(0, 10)
      : '',
  });
  const [version, setVersion] = useState(dispatch.updatedAt);
  const issued = GONE_DISPATCH_STAGES.includes(dispatch.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await dispatchApi.update({
          id: dispatch._id,
          expectedUpdatedAt: version,
          ...(!issued && { invoice: {
            date: text(values.invoiceDate),
            number: text(values.invoiceNumber),
            /* Only when it is shown at all — a redacted reader must not write a blank over it. */
            ...(dispatch.valueHidden
              ? {}
              : { value: values.invoiceValue === '' ? undefined : Number(values.invoiceValue) }),
          },
          }),
          lrNumber: text(values.lrNumber),
          ewayBillNumber: text(values.ewayBillNumber),
          transporter: text(values.transporter),
          vehicleNumber: text(values.vehicleNumber),
          expectedDeliveryDate: text(values.expectedDeliveryDate),
        });
      setVersion((saved.data ?? saved).updatedAt);
      onSaved(saved);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  if (!mayWrite) {
    return (
      <Section title="The paperwork">
        <dl className="space-y-3 text-sm">
          <Facts
            items={[
              { label: 'Invoice', value: dispatch.invoice?.number },
              ...(dispatch.valueHidden
                ? []
                : [{ label: 'Invoice value', value: rupees(dispatch.invoice?.value) }]),
              { label: 'LR number', value: dispatch.ownVehicle ? 'Own vehicle' : dispatch.lrNumber },
              { label: 'E-way bill', value: dispatch.ewayBillNumber },
              { label: 'Transporter', value: dispatch.ownVehicle ? 'Own vehicle' : dispatch.transporter },
              { label: 'Vehicle', value: dispatch.vehicleNumber },
            ]}
          />
        </dl>
      </Section>
    );
  }

  return (
    <Section
      title="The paperwork"
      actions={
        outstanding?.length > 0 && (
          <span className="text-xs text-warn-400">Needs {outstanding.join(', ')}</span>
        )
      }
    >
      {/*
        Said before the button refuses. §19 promises marketing sees these the moment the lorry
        leaves, and a promise the system cannot keep is worse than no promise.
      */}
      {outstanding?.length > 0 && !GONE_DISPATCH_STAGES.includes(dispatch.status) && (
        <Notice tone="warn">
          This cannot be dispatched until it has {outstanding.join(', ')} &mdash; marketing is
          promised all of it the moment the lorry leaves [§19].
        </Notice>
      )}

      {issued && <Notice tone="info">The issued invoice is fixed. Contact accounts if a correction is needed.</Notice>}
      <form onSubmit={save} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice number">
            <input className="input" disabled={issued} value={values.invoiceNumber} onChange={set('invoiceNumber')} />
          </Field>
          <Field label="Invoice date"><input type="date" className="input" disabled={issued} value={values.invoiceDate} onChange={set('invoiceDate')} /></Field>
          {!dispatch.valueHidden && (
            <Field label="Invoice value">
              <input type="number" min="0.01" step="0.01" disabled={issued} className="input" value={values.invoiceValue} onChange={set('invoiceValue')} />
            </Field>
          )}
          <Field
            label="LR number"
            hint={
              dispatch.ownVehicle
                ? 'Not needed — this goes on our own vehicle'
                : 'The lorry receipt the transporter issues'
            }
          >
            <input
              className="input"
              disabled={dispatch.ownVehicle}
              value={values.lrNumber}
              onChange={set('lrNumber')}
            />
          </Field>
          <Field label="E-way bill" hint="Above ₹50,000 by road">
            <input className="input" value={values.ewayBillNumber} onChange={set('ewayBillNumber')} />
          </Field>
          <Field label="Transporter">
            <input
              className="input"
              disabled={dispatch.ownVehicle}
              value={dispatch.ownVehicle ? 'Own vehicle' : values.transporter}
              onChange={set('transporter')}
            />
          </Field>
          <Field label="Vehicle number">
            <input className="input" value={values.vehicleNumber} onChange={set('vehicleNumber')} />
          </Field>
          <Field label="Expected delivery">
            <input
              type="date"
              className="input"
              value={values.expectedDeliveryDate}
              onChange={set('expectedDeliveryDate')}
            />
          </Field>
        </div>

        <FormError error={error} />

        <div className="flex justify-end border-t border-line/[0.06] pt-4">
          <button type="submit" className="btn-secondary" disabled={busy}>
            {busy ? 'Saving…' : 'Save the paperwork'}
          </button>
        </div>
      </form>
    </Section>
  );
}

function ProofOfDelivery({ dispatch, onSaved, mayWrite }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await dispatchApi.setPod(dispatch._id, file));
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  /* Nothing to prove until it has gone — and the server refuses it, so the panel stays away. */
  if (!GONE_DISPATCH_STAGES.includes(dispatch.status)) return null;

  const filed = dispatch.pod?.attachment;

  return (
    <Section title="Proof of delivery">
      <div className="flex flex-wrap items-center gap-3">
        {filed ? (
          <a
            className="text-sm font-semibold text-accent hover:underline"
            href={`/api/files/${filed.key}`}
            target="_blank"
            rel="noreferrer"
          >
            {filed.filename || 'Open the signed copy'}
          </a>
        ) : (
          /* The document accounts will want the day a buyer disputes having taken delivery. */
          <p className="text-sm text-warn-400">The signed copy has not come back</p>
        )}

        {mayWrite && (
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? 'Uploading…' : filed ? 'Replace it' : 'File the POD'}
            </button>
            <input ref={input} type="file" className="hidden" accept=".pdf,image/*" onChange={upload} />
          </>
        )}
      </div>

      {dispatch.pod?.receivedAt && (
        <p className="mt-2 text-xs text-steel-500">Filed {formatDate(dispatch.pod.receivedAt)}</p>
      )}

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}
    </Section>
  );
}

/* --------------------------------- The page --------------------------------- */

export default function DispatchDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();

  const fetch = useCallback((dispatchId) => dispatchApi.get(dispatchId), []);
  const { data, setData, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading the consignment" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.data) return null;

  const dispatch = data.data;
  const outstanding = data.outstanding || [];
  const mayWrite = canWrite('dispatch');
  const editable = PRE_LOAD_DISPATCH_STAGES.includes(dispatch.status);

  /** A reply from a save or an action carries the whole consignment back, paperwork and all. */
  const absorb = (next) =>
    setData({ ...data, data: next.data ?? next, outstanding: next.outstanding ?? outstanding });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={dispatch.number}
        subtitle={
          <>
            <Link to={`/orders/${dispatch.order?._id}`} className="hover:text-accent">
              {dispatch.order?.number}
            </Link>
            {' · '}
            <Link to={`/customers/${dispatch.customer?._id}`} className="hover:text-accent">
              {dispatch.customer?.name}
            </Link>
            {' · '}
            {formatNumber(dispatch.dispatchQty)} pcs
          </>
        }
        actions={<Badge status={dispatch.status}>{dispatchStageLabel(dispatch.status)}</Badge>}
      />

      {/*
        The decisions somebody took against a warning, at the top of the consignment they were
        taken on [§15, §19]. They were on the order screen's tracker and nowhere here, which is
        the wrong way round: the order screen is where one gets noticed, and this is the screen
        somebody opens once they have been asked about it. Drawn from the shared table in
        `OverrideNotices`, so a fourth one cannot appear on one screen and not the other.
      */}
      <OverrideNotices dispatch={dispatch} className="mb-5" />

      {(dispatch.accountingPending || dispatch.orderSyncPending) && <div className="mb-5"><Notice tone="warn">This consignment is saved. Accounting or order totals are still being completed. Refresh to check progress.</Notice><button type="button" className="btn-secondary mt-2" onClick={reload}>Refresh status</button></div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Section
            title="What is on it"
            actions={
              !editable && (
                <span className="text-xs text-steel-500">
                  Fixed &mdash; cancel and re-raise if the load changed
                </span>
              )
            }
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2.5">Model</th>
                    <th className="px-3 py-2.5">Colour</th>
                    <th className="px-3 py-2.5 text-right">Pieces</th>
                    <th className="px-3 py-2.5 text-right">Cartons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {dispatch.lines?.map((line) => (
                    <tr key={line._id}>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-steel-100">{line.modelNumber || '—'}</p>
                        <p className="text-xs text-steel-500" title={line.mould?.name}>
                          {line.mould?.mouldCode || 'Bought in'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-steel-300">{line.colour || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                        {formatNumber(line.quantity)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-steel-400">
                        {line.cartons ? formatNumber(line.cartons) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end gap-6 border-t border-line/[0.06] pt-3 text-sm">
              <span className="text-steel-400">On the lorry</span>
              <span className="tabular-nums font-semibold text-steel-100">
                {formatNumber(dispatch.dispatchQty)} pcs
              </span>
            </div>
          </Section>

          <Paperwork
            dispatch={dispatch}
            outstanding={outstanding}
            onSaved={absorb}
            mayWrite={mayWrite}
          />

          <DispatchActionsPanel dispatch={dispatch} onDone={absorb} mayWrite={mayWrite} />

          <Section title={`History (${dispatch.statusHistory?.length || 0})`}>
            <ol className="space-y-3">
              {[...(dispatch.statusHistory || [])].reverse().map((entry, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-line/30" />
                  <div>
                    <p className="text-steel-200">{dispatchStageLabel(entry.to)}</p>
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
          <Section title="Where it is going">
            {/*
              Editable here, which it was not. §19 gates despatch on a delivery address and the
              only box that could supply one lived on the despatch board's blocked card — so the
              consignment's own page named the problem and could not fix it.
            */}
            <DeliveryAddress
              dispatch={dispatch}
              customer={dispatch.customer}
              editable={mayWrite}
              onSaved={reload}
            />

            <dl className="mt-3 space-y-3 text-sm">
              <Facts
                columns={1}
                items={[
                  { label: 'Left', value: dispatch.dispatchDate && formatDate(dispatch.dispatchDate) },
                  /*
                   * When it is owed. It was missing from this panel altogether, which made the
                   * consignment's own page the one place that could not answer the question the
                   * yard opens it to ask — and the red notice below quoted a date the page never
                   * showed. Labelled by which kind of date it is, because a promise somebody made
                   * on the phone and an estimate the yard typed are not the same commitment.
                   */
                  {
                    label: dispatch.dueDateIsPromise ? 'Promised for' : 'Due to arrive',
                    value: dispatch.dueDate && formatDate(dispatch.dueDate),
                  },
                  ...(dispatch.dueDateIsPromise &&
                  dispatch.expectedDeliveryDate &&
                  dispatch.expectedDeliveryDate !== dispatch.dueDate
                    ? [{
                        label: 'Our estimate',
                        value: formatDate(dispatch.expectedDeliveryDate),
                      }]
                    : []),
                  {
                    label: 'Delivered',
                    value: dispatch.deliveredAt && formatDate(dispatch.deliveredAt),
                  },
                  { label: 'Raised by', value: dispatch.raisedBy?.name },
                ]}
              />
            </dl>

            {/* Whose date it was, when it was a promise: "we said the 20th" is a different
                conversation from "we thought the 20th", and the difference is a name. */}
            {dispatch.promise?.date && (
              <p className="mt-2 text-xs text-steel-500">
                Promised by {dispatch.promise.by?.name || 'marketing'}
                {dispatch.promise.at ? ` on ${formatDate(dispatch.promise.at)}` : ''}
                {dispatch.promise.note ? ` · ${dispatch.promise.note}` : ''}
              </p>
            )}

            {/* `dueDate`, the date `isOverdue` is actually measured against — the estimate read
                as a date in the future next to the words "past its delivery date". */}
            {dispatch.isOverdue && (
              <Notice tone="danger">
                Past {dispatch.dueDateIsPromise ? 'the date promised to the buyer' : 'its delivery date'}
                {' '}of {formatDate(dispatch.dueDate || dispatch.expectedDeliveryDate)} and not
                acknowledged as delivered.
              </Notice>
            )}

            {dispatch.cancellationReason && (
              <Notice tone="warn">Cancelled: {dispatch.cancellationReason}</Notice>
            )}
          </Section>

          <ProofOfDelivery dispatch={dispatch} onSaved={(next) => absorb({ data: next })} mayWrite={mayWrite} />

          <HistoryPanel model="Dispatch" id={dispatch._id} refreshKey={dispatch.updatedAt} />
        </div>
      </div>
    </div>
  );
}
