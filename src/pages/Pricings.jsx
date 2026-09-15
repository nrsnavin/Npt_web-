import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import PricingDecision from '../components/PricingDecision.jsx';
import CostingSheetForm from '../components/CostingSheetForm.jsx';
import CostingDetailsForm from '../components/CostingDetailsForm.jsx';
import { CustomerSelect, MouldSelect } from '../components/pickers.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import QuoteFromCosting from '../components/QuoteFromCosting.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import { inDays } from '../utils/pipeline.js';

/**
 * Costing sheets [BLUEPRINT §7, §9].
 *
 * The screen shows two different things to two different people, and that is the module rather
 * than a nicety. Costing and management see the sheet: the cost lines, the margin, the floor.
 * Marketing sees the price they may quote and whether it is cleared to go out — and the server
 * has already removed the rest [§8], so this cannot leak it by forgetting.
 *
 * The one thing marketing does get about the floor is whether the price is under it, because a
 * block nobody can explain reads as the system being broken.
 */

const PRICING_STAGES = [
  { value: 'requested', label: 'Requested' },
  { value: 'costed', label: 'Costed' },
  { value: 'approval_pending', label: 'Needs approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Refused' },
];

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/**
 * A costing raised by hand, with no enquiry behind it.
 *
 * The automation covers an enquiry reaching Pricing required; this covers everything else — a
 * rate wanted for a tender, a standing price refreshed because the resin rate moved, a walk-in
 * asking what a model would cost. Without it the only way to get a number is to invent an
 * enquiry, and a pipeline fills with enquiries nobody is working.
 *
 * The customer is still required: the same hanger costs different money for a buyer taking
 * 40,000 and one taking 2,000, so a cost with no customer on it is not a cost of anything.
 */
function NewCostingForm({ onClose, onSaved }) {
  const [customer, setCustomer] = useState('');
  const [mould, setMould] = useState('');
  const [modelNumber, setModel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!customer) return setError('Pick the customer this costing is for.');
    if (!quantity) return setError('Say what quantity to cost.');

    setBusy(true);
    setError(null);
    try {
      /*
       * The model number is left out when a mould is chosen: the server copies it from the
       * register [§28]. Sending a blank would overwrite what it knows with nothing.
       */
      onSaved(
        await pricingsApi.create({
          customer,
          mould: mould || undefined,
          modelNumber: modelNumber || undefined,
          quantity: Number(quantity),
          targetPrice: targetPrice === '' ? undefined : Number(targetPrice),
          remarks: remarks || undefined,
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
      <Notice tone="info">
        No enquiry needed. Raise one here for a tender, a repeat job or a walk-in — it becomes
        the same costing sheet either way.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <CustomerSelect value={customer} onChange={setCustomer} aria-label="Customer" />
        </Field>
        <Field label="Model" hint="The tool it runs on — leave empty for a traded piece">
          <MouldSelect value={mould} onChange={setMould} aria-label="Model" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quantity to cost">
          <input
            type="number"
            min="1"
            className="input"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
        <Field label="Model number" hint="What the buyer calls it, or all of it if it is traded">
          <input
            className="input"
            value={modelNumber}
            onChange={(event) => setModel(event.target.value)}
          />
        </Field>
        <Field label="Target price" hint="What the buyer wants to pay, if they said">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={targetPrice}
            onChange={(event) => setTargetPrice(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Remarks">
        <textarea
          rows={2}
          className="input"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
        />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Raising…' : 'Raise the costing'}
        </button>
      </div>
    </form>
  );
}


export default function Pricings() {
  const { canWrite, canQuote } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [costing, setCosting] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [raising, setRaising] = useState(null);
  const [editing, setEditing] = useState(null);
  const [quoting, setQuoting] = useState(null);
  const [madeQuote, setMadeQuote] = useState(null);
  const { sort, toggle } = useSort();
  const [params] = useSearchParams();

  const mayCost = canWrite('pricing');
  /* Raising a quote is a quoting right, not a costing one: marketing may turn an approved
     price into a quotation without ever seeing the cost behind it. */
  const mayQuote = canQuote('pricing');
  const term = useDebounced(search);

  const filters = {
    search: term || undefined,
    status: status || undefined,
    enquiry: params.get('enquiry') || undefined,
  };
  const { data, pagination, meta, loading, error, reload } = useRecordList(pricingsApi.list, {
    ...filters,
    sort: sort || undefined,
    page,
    limit: 25,
  });

  const selectStage = (value) => {
    setStatus(value === status ? '' : value);
    setPage(1);
  };

  /* Back to page one on every sort. Re-ordering four hundred rows while staying on page seven
     lands the reader in the middle of an ordering they have not seen the top of. */
  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const saved = () => {
    setCosting(null);
    setDeciding(null);
    setRaising(null);
    setEditing(null);
    reload();
  };

  /*
   * A raised quote opens straight into its document. The question immediately after quoting is
   * always "what does that look like" — and the moment to catch a wrong quantity or a missing
   * payment term is while it is still a draft, not after it has been sent.
   */
  const quoted = (quotation) => {
    setMadeQuote(quotation);
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Costings"
        subtitle={
          mayCost
            ? 'What a job costs to make, and the price marketing may quote against it'
            : 'The price you may quote. What it costs to make is management’s to see'
        }
        actions={
          <div className="flex items-center gap-2">
            {/* The other half of this module's question. A costing is worth having because it
                becomes a price somebody sends; what has actually been sent, and off which
                sheet, is one click from here rather than two screens away. */}
            <Link to="/quotations/sent" className="btn-secondary">
              Sent quotations
            </Link>
            {mayCost && (
              <button type="button" className="btn-primary" onClick={() => setRaising(true)}>
                + New costing
              </button>
            )}
          </div>
        }
      />

      <StagePipeline
        stages={PRICING_STAGES}
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

      {loading && <TableSkeleton columns={mayCost ? 7 : 5} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No costings here"
          description="An enquiry reaching Pricing required raises one by itself."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="number" label="Costing" sort={sort} onToggle={sortBy} />
                    {/* The customer is a populated reference, so the collection has an id to
                        order by and not a name — sorting by it would group the table by
                        whichever buyer happened to be created first, which reads as random. */}
                    <th className="px-3 py-3">Customer</th>
                    <SortHeader field="modelNumber" label="Model" sort={sort} onToggle={sortBy} />
                    <SortHeader field="quantity" label="Quantity" sort={sort} onToggle={sortBy} align="right" />
                    {/* Cost and margin are virtuals — worked out on the way out of the document,
                        so there is nothing stored for the database to order by. A heading that
                        offered it would draw an arrow and not sort. */}
                    {mayCost && <th className="px-3 py-3 text-right">Cost</th>}
                    <SortHeader field="approvedSellingPrice" label="Price" sort={sort} onToggle={sortBy} align="right" />
                    {mayCost && <th className="px-3 py-3 text-right">Margin</th>}
                    <SortHeader field="status" label="Stage" sort={sort} onToggle={sortBy} />
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <Link
                          to={`/pricings/${row._id}`}
                          className="font-semibold text-steel-100 hover:text-accent"
                        >
                          {row.number}
                        </Link>
                        <p className="text-xs text-steel-400">{formatDate(row.requestedAt)}</p>
                      </td>
                      <td className="px-3 py-3.5 text-steel-200">{row.customer?.name || '—'}</td>
                      <td className="px-3 py-3.5 text-steel-300">{row.modelNumber || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.quantity)}
                      </td>
                      {mayCost && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-400">
                          {rupees(row.totalCost)}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                        {rupees(row.approvedSellingPrice)}
                        {/* Marketing's one fact about the floor: whether they may quote yet.
                            Not `belowMinimum` — a sheet MD has signed off is still under the
                            floor, and this hint beside an Approved badge reads as a block. */}
                        {row.needsApproval && (
                          <p className="text-xs font-semibold text-warn-400">Needs approval</p>
                        )}
                      </td>
                      {mayCost && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-300">
                          {row.grossMarginPercent === null || row.grossMarginPercent === undefined
                            ? '—'
                            : `${row.grossMarginPercent}%`}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <Badge status={row.status}>{humanise(row.status)}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right">
                        {mayCost && row.status === 'approval_pending' && (
                          <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setDeciding(row)}>
                            Decide
                          </button>
                        )}
                        {/*
                          Available at every stage, settled included. Refusing to edit a
                          settled sheet sent people to raise a second costing for the same
                          job, which is how one job ends up with three sheets and nobody can
                          say which price is live. §9 re-runs on save, so a price that no
                          longer clears the floor goes back for signature.
                        */}
                        {mayCost && row.status !== 'approval_pending' && (
                          <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setCosting(row)}>
                            {{ requested: 'Build it', approved: 'Re-cost', rejected: 'Re-cost' }[row.status] || 'Edit'}
                          </button>
                        )}
                        {mayCost && (
                          <button
                            type="button"
                            className="btn-secondary ml-2 px-3 py-1 text-xs"
                            onClick={() => setEditing(row)}
                          >
                            Details
                          </button>
                        )}
                        {/*
                          The action that follows an approved price, on the row that carries it.
                          Everything the quote needs is on this sheet — sending somebody to the
                          quotations screen to retype it is how the link between them gets lost.
                        */}
                        {mayQuote && row.status === 'approved' && (
                          <button
                            type="button"
                            className="btn-primary ml-2 px-3 py-1 text-xs"
                            onClick={() => setQuoting(row)}
                          >
                            Raise a quote
                          </button>
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

      {/* Said once, where somebody would otherwise wonder why the table is thin. */}
      {!mayCost && data.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-steel-500">
          The cost base, the margin and the minimum price are management’s [§8]. What you see is
          the price you may quote, and whether it is cleared to go out.
        </p>
      )}

      <Modal
        open={Boolean(costing)}
        title={`Costing ${costing?.number || ''}`}
        description="Every line is per piece. The calculated price is worked out, not typed"
        size="lg"
        onClose={() => setCosting(null)}
      >
        {costing && <CostingSheetForm pricing={costing} onClose={() => setCosting(null)} onSaved={saved} />}
      </Modal>

      <Modal
        open={Boolean(deciding)}
        title={`Approve ${deciding?.number || ''}?`}
        description="This price is below the approved minimum, so nothing can be quoted until it is settled"
        onClose={() => setDeciding(null)}
      >
        {deciding && (
          <PricingDecision pricing={deciding} onClose={() => setDeciding(null)} onSaved={saved} />
        )}
      </Modal>

      <Modal
        open={Boolean(editing)}
        title={`Details of ${editing?.number || ''}`}
        description="What this costing is for. The cost lines are on the sheet itself"
        size="lg"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <CostingDetailsForm pricing={editing} onClose={() => setEditing(null)} onSaved={saved} />
        )}
      </Modal>

      <Modal
        open={Boolean(raising)}
        title="New costing"
        description="For a job with no enquiry behind it — a tender, a repeat, a walk-in"
        size="lg"
        onClose={() => setRaising(null)}
      >
        {raising && <NewCostingForm onClose={() => setRaising(null)} onSaved={saved} />}
      </Modal>

      <Modal
        open={Boolean(quoting)}
        title={`Quote from ${quoting?.number || ''}`}
        description="The customer, the model and the price come off the costing. Set the quantity and the terms"
        size="lg"
        onClose={() => setQuoting(null)}
      >
        {quoting && (
          <QuoteFromCosting
            pricing={quoting}
            onClose={() => setQuoting(null)}
            onQuoted={quoted}
          />
        )}
      </Modal>

      {/*
        The document, opened on the quote that was just raised — and the place it is sent from.
        Raising a quote and sending it are one errand; splitting them across two screens is how
        a quotation ends up sitting in draft while everybody believes the buyer has it.
      */}
      <QuotationPdf
        quotation={madeQuote}
        open={Boolean(madeQuote)}
        onClose={() => setMadeQuote(null)}
        onSent={(sent) => {
          /* Null when §9 refused it — the quote moved to the approval queue, so the board below
             is stale either way and the dialog says what happened. */
          if (sent) setMadeQuote(sent);
          reload();
        }}
      />
    </div>
  );
}
