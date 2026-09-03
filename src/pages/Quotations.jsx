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
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';

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
 * somebody else is a different offer rather than an edit of this one. And prices are shown
 * but not editable: they are what Rev 0 recorded, and moving one is what `Revise` is for.
 *
 * The lines are a list because a quotation is: the plant's own `NP/26-27/1` puts eight models
 * under one number, one validity and one set of payment terms. Everything below the lines
 * belongs to the document; everything in a row belongs to that model.
 */
function QuotationForm({ quotation, onClose, onSaved }) {
  const editing = Boolean(quotation);
  const [customer, setCustomer] = useState(quotation?.customer?._id || quotation?.customer);
  const [lines, setLines] = useState(
    quotation?.lines?.length
      ? quotation.lines.map((line) => ({
          _id: line._id,
          product: line.product?._id ?? line.product ?? '',
          pricing: line.pricing?._id ?? line.pricing ?? '',
          modelNumber: line.modelNumber ?? '',
          moq: line.moq ?? '',
          unitPrice: line.unitPrice ?? '',
        }))
      : [{ product: '', pricing: '', modelNumber: '', moq: '', unitPrice: '' }]
  );
  const [values, setValues] = useState(quotation ? {
    gstPercent: quotation.gstPercent ?? 18,
    isExport: quotation.isExport ?? false,
    paymentTerms: quotation.paymentTerms ?? '',
    deliveryTerms: quotation.deliveryTerms ?? '',
    freightTerms: quotation.freightTerms ?? 'ex_factory',
    packing: quotation.packing ?? '',
    validUntil: quotation.validUntil ? quotation.validUntil.slice(0, 10) : '',
    remarks: quotation.remarks ?? '',
  } : {
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

  const setLine = (index, key) => (event) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, [key]: event.target.value } : line)));

  const addLine = () =>
    setLines([...lines, { product: '', pricing: '', modelNumber: '', moq: '', unitPrice: '' }]);

  /* Never below one: the server refuses an empty quotation, and it is right to. */
  const removeLine = (index) =>
    setLines(lines.length === 1 ? lines : lines.filter((unused, at) => at !== index));

  /*
   * The span of the rates being entered, not a total of them.
   *
   * A quotation quotes a rate per model against a minimum; the purchase order settles the
   * quantity. There is nothing to total — and adding eight rates together would produce a
   * number that looks like money and means nothing at all.
   */
  const rates = lines.map((line) => Number(line.unitPrice)).filter((value) => value > 0);

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
        gstPercent: values.isExport ? undefined : Number(values.gstPercent),
        validUntil: values.validUntil || undefined,
        /*
         * Sent whole. A line's costing and its id travel with it so the server can keep the
         * §9 floor attached to the model it belongs to — a revision that dropped `pricing`
         * would silently detach the costing and stop the floor check applying.
         */
        lines: lines.map((line) => ({
          ...(line._id ? { _id: line._id } : {}),
          ...(line.product ? { product: line.product } : {}),
          ...(line.pricing ? { pricing: line.pricing } : {}),
          modelNumber: line.modelNumber || undefined,
          quantity: Number(line.quantity),
          moq: line.moq === '' ? undefined : Number(line.moq),
          unitPrice: Number(line.unitPrice),
        })),
      };

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

      {/*
        The lines. Each row is a model the buyer is being offered; the terms below belong to the
        document. Prices are locked once the quote exists — the whole of §10 is that the old one
        is kept, so a change goes through Revise.
      */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Models on this quotation</p>
          <button type="button" className="row-action" onClick={addLine}>
            + Add a model
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={line._id || index} className="card px-3 py-3">
              <div className="grid gap-3 sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_auto] sm:items-end">
                <Field label={index === 0 ? 'Model' : ''}>
                  <input
                    className="input"
                    placeholder="NPT-400S"
                    value={line.modelNumber}
                    onChange={setLine(index, 'modelNumber')}
                  />
                </Field>
                <Field
                  label={index === 0 ? 'Unit price (₹)' : ''}
                  hint={index === 0 && editing ? 'Changed through Revise [§10]' : undefined}
                >
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required={!editing}
                    disabled={editing}
                    className="input"
                    value={line.unitPrice}
                    onChange={setLine(index, 'unitPrice')}
                  />
                </Field>
                {/* A term of the offer, and per line: a 400mm shirt hanger and a velvet suit
                    hanger on the same document have different minimums. Blank takes the
                    model's catalogue standard [§28]. */}
                <Field label={index === 0 ? 'Minimum' : ''} hint={index === 0 ? "Blank uses the catalogue's" : undefined}>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={line.moq}
                    onChange={setLine(index, 'moq')}
                  />
                </Field>
                <button
                  type="button"
                  className="row-action pb-2 disabled:opacity-30"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                  aria-label={`Remove ${line.modelNumber || 'this line'}`}
                  title={lines.length === 1 ? 'A quotation needs at least one line' : 'Remove'}
                >
                  ×
                </button>
              </div>
              {line.pricing && (
                <p className="mt-1 text-[0.6875rem] text-steel-500">
                  Priced off a costing — the floor still applies to this line [§9]
                </p>
              )}
            </div>
          ))}
        </div>

        {/* The document total, so the number the buyer will see is visible while typing. */}
        <p className="mt-2 text-right text-xs text-steel-400">
          {rates.length === 0
            ? 'Rates per piece'
            : rates.length === 1 || Math.min(...rates) === Math.max(...rates)
              ? 'Rate'
              : 'Rates'}{' '}
          <span className="tabular-nums text-steel-100">
            {rates.length === 0
              ? '—'
              : Math.min(...rates) === Math.max(...rates)
                ? rupees(Math.min(...rates))
                : `${rupees(Math.min(...rates))} – ${rupees(Math.max(...rates))}`}
          </span>
          {' · '}
          {lines.length} {lines.length === 1 ? 'model' : 'models'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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

/**
 * New prices on the same quote. The old ones are already in the list below it.
 *
 * Every line is offered, not just one, because a revision on a real quotation is routinely a
 * discount on two models out of eight — and the whole set is what gets recorded, so the next
 * round is argued from the document rather than from memory. Lines left alone keep their price.
 */
function RevisionForm({ quotation, onClose, onSaved }) {
  const [prices, setPrices] = useState(
    Object.fromEntries((quotation.lines || []).map((line) => [line._id, String(line.unitPrice)]))
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const moved = (quotation.lines || []).filter(
    (line) => Number(prices[line._id]) !== line.unitPrice
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await quotationsApi.revise({
          id: quotation._id,
          /*
           * The whole set, with each line's own id and costing carried across — that is what
           * keeps §9's floor attached to the model it belongs to on the next send.
           */
          lines: (quotation.lines || []).map((line) => ({
            _id: line._id,
            ...(line.product ? { product: line.product._id ?? line.product } : {}),
            ...(line.pricing ? { pricing: line.pricing._id ?? line.pricing } : {}),
            modelNumber: line.modelNumber || undefined,
            quantity: line.quantity,
            moq: line.moq,
            unitPrice: Number(prices[line._id]),
          })),
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
              <span className="tabular-nums text-steel-100">
                {(() => {
                  /* The span of rates offered in that revision. Summing rates across models
                     would produce a figure that looks like money and is not one. */
                  const offered = (rev.lines || []).map((line) => line.unitPrice);
                  if (!offered.length) return '—';
                  const low = Math.min(...offered);
                  const high = Math.max(...offered);
                  const span = low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`;
                  return offered.length === 1 ? span : `${offered.length} models · ${span}`;
                })()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="eyebrow mb-2">
          New prices — this becomes Rev {(quotation.revision ?? 0) + 1}
        </p>
        <div className="space-y-2">
          {(quotation.lines || []).map((line, index) => {
            const changed = Number(prices[line._id]) !== line.unitPrice;
            return (
              <div key={line._id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-steel-200">
                  {line.modelNumber || `Line ${index + 1}`}
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-steel-500">
                  {rupees(line.unitPrice)}
                </span>
                <span className="text-steel-600">→</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  autoFocus={index === 0}
                  className={`input flex-1 ${changed ? 'ring-1 ring-flame-500/40' : ''}`}
                  value={prices[line._id] ?? ''}
                  onChange={(event) =>
                    setPrices({ ...prices, [line._id]: event.target.value })
                  }
                />
              </div>
            );
          })}
        </div>
        {/* Said before saving: a revision that revises nothing is refused by the server. */}
        <p className="mt-2 text-[0.6875rem] text-steel-500">
          {moved.length
            ? `${moved.length} of ${quotation.lines.length} prices changed.`
            : 'Nothing has changed yet — a revision has to revise something.'}
        </p>
      </div>

      <Field label="Why" hint="Recorded against the revision in the history">
        <input className="input" placeholder="Buyer pushed back on the landed cost" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !moved.length}>
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
        {quotation.number} rev {quotation.revision} went out
        {quotation.lines?.length === 1
          ? ` at ${rupees(quotation.lines[0].unitPrice)}`
          : ` — ${quotation.lines?.length ?? 0} models`}
        .
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
                    <th className="px-3 py-3 text-right">Minimum</th>
                    <th className="px-3 py-3 text-right">Rate per piece</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <Link
                          to={`/quotations/${row._id}`}
                          className="font-semibold text-steel-100 hover:text-accent"
                        >
                          {row.number}
                        </Link>
                        <p className="text-xs text-steel-400">
                          Rev {row.revision}
                          {row.sentAt ? ` · sent ${formatDate(row.sentAt)}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-steel-200">{row.customer?.name || '—'}</td>
                      {/*
                        One model named, or a count. Naming the first of eight and leaving the
                        rest implied is how a row comes to describe a document it does not
                        describe — the reader has no way to tell the two apart.
                      */}
                      <td className="px-3 py-3.5 text-steel-300">
                        {row.lines?.length === 1
                          ? row.lines[0].modelNumber || '—'
                          : `${row.lines?.length ?? 0} models`}
                        {row.lines?.length > 1 && (
                          <p className="truncate text-[0.6875rem] text-steel-500">
                            {row.lines.map((line) => line.modelNumber).filter(Boolean).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                        {row.lines?.length === 1 && row.lines[0].moq
                          ? `${formatNumber(row.lines[0].moq)} pcs`
                          : '—'}
                      </td>
                      {/*
                        * The rate, or the span of them. A multi-model quotation has no single
                        * price and no total either — the purchase order settles the quantity, so
                        * there is nothing to add up.
                        */}
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                        {(() => {
                          const offered = (row.lines || []).map((line) => line.unitPrice);
                          if (!offered.length) return '—';
                          const low = Math.min(...offered);
                          const high = Math.max(...offered);
                          return low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`;
                        })()}
                        {row.lines?.length > 1 && (
                          <p className="text-[0.6875rem] text-steel-500">
                            {row.lines.length} models
                          </p>
                        )}
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
