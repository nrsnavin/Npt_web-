import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import { CustomerSelect } from '../components/pickers.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';

/**
 * Quotations [BLUEPRINT §10].
 *
 * The screen is built around the one rule §10 insists on: **every revision stays**. So the
 * price is not an editable field — it is a list, and changing it appends. Rev 0 ₹7.50, Rev 1
 * ₹7.30, Rev 2 ₹7.20, all still answerable six weeks later when the buyer asks what they were
 * last told.
 *
 * Sending is the other moment that matters, because §9's gate applies there rather than at the
 * draft: a draft under the floor is a perfectly reasonable thing to be working on; putting it
 * in front of a customer is what waits for a signature.
 */

const QUOTATION_STAGES = [
  { value: 'draft', label: 'Draft' },
  { value: 'approval_pending', label: 'Needs approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'revised', label: 'Revised' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Refused' },
];

const FREIGHT = [
  { value: 'ex_factory', label: 'Ex-factory' },
  { value: 'fob', label: 'FOB' },
  { value: 'cif', label: 'CIF' },
  { value: 'door_delivery', label: 'Door delivery' },
];

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * One form for writing a quotation and for correcting one.
 *
 * Editing is only ever offered on a draft. Once a quote has gone to the customer, changing what
 * it says goes through a revision instead — the server refuses it either way [§10], and a form
 * that let you type a change it would then reject is worse than no form.
 *
 * Two fields behave differently when editing. The customer is fixed, because a quote to
 * somebody else is a different offer rather than an edit of this one. And the price is shown
 * but not editable: it is what Rev 0 recorded, and moving it is what `Revise` is for.
 */
function QuotationForm({ quotation, onClose, onSaved }) {
  const editing = Boolean(quotation);
  const [customer, setCustomer] = useState(quotation?.customer?._id || quotation?.customer);
  const [values, setValues] = useState(quotation ? {
    modelNumber: quotation.modelNumber ?? '',
    quantity: quotation.quantity ?? '',
    moq: quotation.moq ?? '',
    unitPrice: quotation.unitPrice ?? '',
    gstPercent: quotation.gstPercent ?? 18,
    isExport: quotation.isExport ?? false,
    paymentTerms: quotation.paymentTerms ?? '',
    deliveryTerms: quotation.deliveryTerms ?? '',
    freightTerms: quotation.freightTerms ?? 'ex_factory',
    packing: quotation.packing ?? '',
    validUntil: quotation.validUntil ? quotation.validUntil.slice(0, 10) : '',
    remarks: quotation.remarks ?? '',
  } : {
    modelNumber: '',
    quantity: '',
    moq: '',
    unitPrice: '',
    gstPercent: 18,
    isExport: false,
    paymentTerms: '30 days from invoice',
    deliveryTerms: '',
    freightTerms: 'ex_factory',
    packing: '',
    validUntil: inDays(30),
    remarks: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) =>
    setValues({ ...values, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (!customer) {
      setError('Pick the customer this quote is for.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...values,
        quantity: Number(values.quantity),
        moq: values.moq === '' ? undefined : Number(values.moq),
        gstPercent: values.isExport ? undefined : Number(values.gstPercent),
        validUntil: values.validUntil || undefined,
      };

      /*
       * The price is left out of an edit entirely rather than sent unchanged. The server
       * refuses a *changed* price here — it belongs to a revision — and sending the current
       * one back would work only until a rounding difference made it look changed.
       */
      if (editing) delete payload.unitPrice;
      else payload.unitPrice = Number(values.unitPrice);

      onSaved(
        editing
          ? await quotationsApi.update({ id: quotation._id, ...payload })
          : await quotationsApi.create({ customer, ...payload })
      );
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Fixed once the quote exists: a quote to somebody else is a different offer. */}
      <Field label="Customer">
        <CustomerSelect
          value={customer}
          onChange={setCustomer}
          disabled={editing}
          aria-label="Customer"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model">
          <input className="input" value={values.modelNumber} onChange={set('modelNumber')} />
        </Field>
        <Field label="Quantity">
          <input type="number" min="1" required className="input" value={values.quantity} onChange={set('quantity')} />
        </Field>
        <Field
          label="Unit price (₹)"
          hint={editing ? 'Changed through Revise, so the old price is kept [§10]' : 'Rev 0 — every later price keeps this one'}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            required={!editing}
            disabled={editing}
            className="input"
            value={values.unitPrice}
            onChange={set('unitPrice')}
          />
        </Field>
        {/* A term of the offer: the buyer reads it beside the price, and it prints on the
            document. Blank takes the model's catalogue standard [§28]. */}
        <Field label="Minimum order quantity" hint="Blank uses the model's catalogue minimum">
          <input type="number" min="0" className="input" value={values.moq} onChange={set('moq')} />
        </Field>
        <Field label="Valid until">
          <input type="date" className="input" value={values.validUntil} onChange={set('validUntil')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms">
          <input className="input" value={values.paymentTerms} onChange={set('paymentTerms')} />
        </Field>
        <Field label="Delivery">
          <input className="input" placeholder="4 weeks from PO" value={values.deliveryTerms} onChange={set('deliveryTerms')} />
        </Field>
        <Field label="Freight">
          <select className="input" value={values.freightTerms} onChange={set('freightTerms')}>
            {FREIGHT.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Packing">
          <input className="input" placeholder="200 pcs per carton" value={values.packing} onChange={set('packing')} />
        </Field>
      </div>

      {/* Export is a different basis, not GST at zero — see the model. */}
      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" checked={values.isExport} onChange={set('isExport')} />
        This is an export quote (no GST)
      </label>

      {!values.isExport && (
        <Field label="GST (%)">
          <input type="number" min="0" max="100" className="input max-w-[8rem]" value={values.gstPercent} onChange={set('gstPercent')} />
        </Field>
      )}

      <Field label="Remarks">
        <textarea rows={2} className="input" value={values.remarks} onChange={set('remarks')} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save the quotation' : 'Create the quotation'}
        </button>
      </div>
    </form>
  );
}

/** A new price on the same quote. The old one is already in the list below it. */
function RevisionForm({ quotation, onClose, onSaved }) {
  const [unitPrice, setPrice] = useState(quotation.unitPrice);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await quotationsApi.revise({
          id: quotation._id,
          unitPrice: Number(unitPrice),
          note: note || undefined,
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg border border-line/[0.08] bg-line/[0.02] px-4 py-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          What has been offered
        </p>
        <ul className="mt-1.5 space-y-1">
          {quotation.revisions?.map((rev) => (
            <li key={rev.revision} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="text-steel-300">
                Rev {rev.revision}
                {rev.sentAt ? <span className="ml-1.5 text-[0.625rem] text-steel-500">sent</span> : null}
              </span>
              <span className="tabular-nums text-steel-100">{rupees(rev.unitPrice)}</span>
            </li>
          ))}
        </ul>
      </div>

      <Field label={`New price — this becomes Rev ${(quotation.revision ?? 0) + 1}`}>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          autoFocus
          className="input"
          value={unitPrice}
          onChange={(event) => setPrice(event.target.value)}
        />
      </Field>

      <Field label="Why" hint="Recorded against the revision in the history">
        <input className="input" placeholder="Buyer pushed back on the landed cost" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Add the revision'}
        </button>
      </div>
    </form>
  );
}

/** What the customer said. Accepting one is what moves the enquiry towards a PO. */
function ResponseForm({ quotation, onClose, onSaved }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const answer = async (accepted) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await quotationsApi.respond({ id: quotation._id, accepted, note: note || undefined }));
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-steel-300">
        {quotation.number} rev {quotation.revision} went out at {rupees(quotation.unitPrice)}.
      </p>

      <Field label="What did they say" hint="Required when refused — it is what the next quote is priced against">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={() => answer(false)}>
          They refused it
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => answer(true)}>
          They accepted
        </button>
      </div>
    </div>
  );
}

export default function Quotations() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [revising, setRevising] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [responding, setResponding] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [params] = useSearchParams();

  const mayWrite = canWrite('quotations');
  const term = useDebounced(search);

  const filters = {
    search: term || undefined,
    status: status || undefined,
    enquiry: params.get('enquiry') || undefined,
  };
  const { data, pagination, meta, loading, error, reload } = useRecordList(quotationsApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const selectStage = (value) => {
    setStatus(value === status ? '' : value);
    setPage(1);
  };

  const send = async (quotation) => {
    setSendError(null);
    try {
      await quotationsApi.send({ id: quotation._id });
      reload();
    } catch (failure) {
      // §9's block arrives here. Said plainly, without the figure it is protecting.
      setSendError(`${quotation.number}: ${failure.message}`);
      reload();
    }
  };

  const saved = () => {
    setRevising(null);
    setResponding(null);
    setCreating(false);
    setEditing(null);
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Quotations"
        subtitle="Every price this plant has offered, and what was said about each one"
        actions={
          mayWrite && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + New quotation
            </button>
          )
        }
      />

      <StagePipeline
        stages={QUOTATION_STAGES}
        counts={meta.stageCounts}
        selected={status}
        onSelect={selectStage}
        loading={loading}
        dense
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number or model…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {sendError && (
        <div className="mb-4">
          <Notice tone="warn">{sendError}</Notice>
        </div>
      )}

      {loading && <TableSkeleton columns={7} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No quotations here"
          description="Quote against an enquiry once its costing is approved."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-3">Quotation</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3 text-right">Quantity</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-3 py-3 text-right">Value</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <p className="font-semibold text-steel-100">{row.number}</p>
                        <p className="text-xs text-steel-400">
                          Rev {row.revision}
                          {row.sentAt ? ` · sent ${formatDate(row.sentAt)}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-steel-200">{row.customer?.name || '—'}</td>
                      <td className="px-3 py-3.5 text-steel-300">{row.modelNumber || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.quantity)}
                        {row.moq ? (
                          <p className="text-[0.6875rem] text-steel-500">
                            min {formatNumber(row.moq)}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                        {rupees(row.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                        {formatCompactCurrency(row.totalValue)}
                        {row.isExport && (
                          <p className="text-[0.625rem] uppercase tracking-wide text-aqua-400">Export</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <Badge status={row.status}>{humanise(row.status)}</Badge>
                        {row.isExpired && (
                          <p className="text-[0.6875rem] text-danger-400">Validity passed</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {/*
                            Outside the write guard and outside the open check, on purpose. The
                            document is what somebody goes looking for months later — after the
                            quote was accepted, or lost — and a reader who may see the quotation
                            may see what was sent.
                          */}
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1 text-xs"
                            onClick={() => setViewing(row)}
                          >
                            PDF
                          </button>
                          {mayWrite && !['accepted', 'rejected'].includes(row.status) && (
                            <>
                            {/*
                              Only while it is still a draft. Once the quote has gone out, what
                              it says changes through a revision — the server refuses it either
                              way, and a button that opens a form the next screen rejects is
                              worse than no button.
                            */}
                            {!row.sentAt && (
                              <button
                                type="button"
                                className="btn-secondary px-2.5 py-1 text-xs"
                                onClick={() => setEditing(row)}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-secondary px-2.5 py-1 text-xs"
                              onClick={() => setRevising(row)}
                            >
                              Revise
                            </button>
                            {row.status !== 'sent' ? (
                              <button
                                type="button"
                                className="btn-primary px-2.5 py-1 text-xs"
                                onClick={() => send(row)}
                              >
                                Send
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-primary px-2.5 py-1 text-xs"
                                onClick={() => setResponding(row)}
                              >
                                Answer
                              </button>
                            )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}

      <Modal
        open={creating}
        title="New quotation"
        description="This price becomes Rev 0 — every later one keeps it"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <QuotationForm onClose={() => setCreating(false)} onSaved={saved} />
      </Modal>

      <Modal
        open={Boolean(revising)}
        title={`Revise ${revising?.number || ''}`}
        description="The price it carried before stays in the history"
        onClose={() => setRevising(null)}
      >
        {revising && (
          <RevisionForm quotation={revising} onClose={() => setRevising(null)} onSaved={saved} />
        )}
      </Modal>

      <Modal
        open={Boolean(responding)}
        title={`What did they say about ${responding?.number || ''}?`}
        description="Accepting it moves the enquiry to PO expected"
        onClose={() => setResponding(null)}
      >
        {responding && (
          <ResponseForm quotation={responding} onClose={() => setResponding(null)} onSaved={saved} />
        )}
      </Modal>

      <Modal
        open={Boolean(editing)}
        title={`Edit ${editing?.number || ''}`}
        description="While it is still a draft. Once it has gone out, changes are revisions"
        size="lg"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <QuotationForm
            quotation={editing}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
        )}
      </Modal>

      <QuotationPdf
        quotation={viewing}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
