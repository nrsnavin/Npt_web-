import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
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

function QuotationForm({ onClose, onSaved }) {
  const [customer, setCustomer] = useState(undefined);
  const [values, setValues] = useState({
    modelNumber: '',
    quantity: '',
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
      onSaved(
        await quotationsApi.create({
          customer,
          ...values,
          quantity: Number(values.quantity),
          unitPrice: Number(values.unitPrice),
          gstPercent: values.isExport ? undefined : Number(values.gstPercent),
          validUntil: values.validUntil || undefined,
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
    <form onSubmit={submit} className="space-y-5">
      <Field label="Customer">
        <CustomerSelect value={customer} onChange={setCustomer} aria-label="Customer" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model">
          <input className="input" value={values.modelNumber} onChange={set('modelNumber')} />
        </Field>
        <Field label="Quantity">
          <input type="number" min="1" required className="input" value={values.quantity} onChange={set('quantity')} />
        </Field>
        <Field label="Unit price (₹)" hint="Rev 0 — every later price keeps this one">
          <input type="number" step="0.01" min="0" required className="input" value={values.unitPrice} onChange={set('unitPrice')} />
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
          {busy ? 'Saving…' : 'Create the quotation'}
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
                        {mayWrite && !['accepted', 'rejected'].includes(row.status) && (
                          <div className="flex justify-end gap-1.5">
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
                          </div>
                        )}
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
    </div>
  );
}
