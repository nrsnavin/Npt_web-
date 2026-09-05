import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
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
    invoiceValue: dispatch.invoice?.value ?? '',
    lrNumber: dispatch.lrNumber || '',
    ewayBillNumber: dispatch.ewayBillNumber || '',
    transporter: dispatch.transporter || '',
    vehicleNumber: dispatch.vehicleNumber || '',
    expectedDeliveryDate: dispatch.expectedDeliveryDate
      ? dispatch.expectedDeliveryDate.slice(0, 10)
      : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await dispatchApi.update({
          id: dispatch._id,
          invoice: {
            number: text(values.invoiceNumber),
            /* Only when it is shown at all — a redacted reader must not write a blank over it. */
            ...(dispatch.valueHidden
              ? {}
              : { value: values.invoiceValue === '' ? undefined : Number(values.invoiceValue) }),
          },
          lrNumber: text(values.lrNumber),
          ewayBillNumber: text(values.ewayBillNumber),
          transporter: text(values.transporter),
          vehicleNumber: text(values.vehicleNumber),
          expectedDeliveryDate: text(values.expectedDeliveryDate),
        })
      );
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

      <form onSubmit={save} className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice number">
            <input className="input" value={values.invoiceNumber} onChange={set('invoiceNumber')} />
          </Field>
          {!dispatch.valueHidden && (
            <Field label="Invoice value">
              <input type="number" min="0" className="input" value={values.invoiceValue} onChange={set('invoiceValue')} />
            </Field>
          )}
          <Field
            label="LR number"
            hint={dispatch.ownVehicle ? 'Not needed — this goes on our own vehicle' : undefined}
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

        {error && (
          <Notice tone="danger">
            <p>{error.message}</p>
            {error.details?.map((detail) => (
              <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
            ))}
          </Notice>
        )}

        <div className="flex justify-end border-t border-line/[0.06] pt-4">
          <button type="submit" className="btn-secondary" disabled={busy}>
            {busy ? 'Saving…' : 'Save the paperwork'}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* -------------------------------- The actions -------------------------------- */

function DispatchActions({ dispatch, onDone }) {
  const [actions, setActions] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /* Re-loaded whenever the status moves: what can be done from `packing` is not what can be
     done from `dispatched`, and a stale list offers an action the server will refuse. */
  useEffect(() => {
    let live = true;
    dispatchApi
      .actions(dispatch._id)
      .then((next) => live && setActions(next))
      .catch(() => live && setActions([]));
    return () => {
      live = false;
    };
  }, [dispatch._id, dispatch.status, dispatch.outstandingPaperwork?.length]);

  const run = async (action) => {
    if (action.needs.length) {
      setChosen(action);
      setValues({});
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await dispatchApi.act({ id: dispatch._id, action: action.action }));
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
      onDone(await dispatchApi.act({ id: dispatch._id, action: chosen.action, ...values }));
      setChosen(null);
    } catch (actError) {
      setError(actError);
    } finally {
      setBusy(false);
    }
  };

  if (CLOSED_DISPATCH_STAGES.includes(dispatch.status)) return null;

  const LABELS = {
    cancellationReason: 'Why is it cancelled?',
    vehicleNumber: 'Which lorry?',
  };

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
              {/* The gate, said out loud rather than hidden behind a missing button. */}
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

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

      <Modal
        open={Boolean(chosen)}
        title={chosen?.label}
        description={chosen?.hint}
        onClose={() => setChosen(null)}
      >
        <form onSubmit={submit} className="space-y-4">
          {/* Only what this action declares it cannot be done without. */}
          {chosen?.needs.map((need) => (
            <Field key={need} label={LABELS[need] || need}>
              {need === 'cancellationReason' ? (
                <textarea
                  rows={3}
                  className="input"
                  autoFocus
                  value={values[need] || ''}
                  onChange={(event) => setValues({ ...values, [need]: event.target.value })}
                />
              ) : (
                <input
                  className="input"
                  autoFocus
                  placeholder="TN39 BX 4412"
                  value={values[need] || ''}
                  onChange={(event) => setValues({ ...values, [need]: event.target.value })}
                />
              )}
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

/* ---------------------------------- The POD ---------------------------------- */

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
                        <p className="text-[0.6875rem] text-steel-500" title={line.mould?.name}>
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

          <DispatchActions dispatch={dispatch} onDone={absorb} />

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
            <dl className="space-y-3 text-sm">
              <Facts
                columns={1}
                items={[
                  { label: 'Consignee', value: dispatch.destination?.name },
                  { label: 'Address', value: dispatch.destination?.address },
                  {
                    label: 'Town',
                    value: [dispatch.destination?.city, dispatch.destination?.state]
                      .filter(Boolean)
                      .join(', '),
                  },
                  { label: 'Contact', value: dispatch.destination?.contactMobile },
                  { label: 'Left', value: dispatch.dispatchDate && formatDate(dispatch.dispatchDate) },
                  {
                    label: 'Delivered',
                    value: dispatch.deliveredAt && formatDate(dispatch.deliveredAt),
                  },
                  { label: 'Raised by', value: dispatch.raisedBy?.name },
                ]}
              />
            </dl>

            {dispatch.isOverdue && (
              <Notice tone="danger">
                Past its delivery date of {formatDate(dispatch.expectedDeliveryDate)} and not
                acknowledged as delivered.
              </Notice>
            )}

            {dispatch.cancellationReason && (
              <Notice tone="warn">Cancelled: {dispatch.cancellationReason}</Notice>
            )}
          </Section>

          <ProofOfDelivery dispatch={dispatch} onSaved={(next) => absorb({ data: next })} mayWrite={mayWrite} />

          <HistoryPanel model="Dispatch" id={dispatch._id} />
        </div>
      </div>
    </div>
  );
}
