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
import { CustomerSelect, MouldSelect } from '../components/pickers.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import QuoteFromCosting from '../components/QuoteFromCosting.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import { inDays, ownsRecord } from '../utils/pipeline.js';
import useOpenFromLink from '../hooks/useOpenFromLink.js';

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
  /*
   * The models this sheet is to price, a row each [§7].
   *
   * A conversation with a buyer is about four hangers rather than one, and raising four sheets
   * for it gives the same job four numbers, four approvals and four quotations. One row is the
   * ordinary case and stays a single line to fill in; the "Add another" is for the conversation
   * that covered five.
   */
  const [rows, setRows] = useState([{ mould: '', modelNumber: '' }]);
  const [targetPrice, setTargetPrice] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setRow = (index, patch) =>
    setRows(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const addRow = () => setRows([...rows, { mould: '', modelNumber: '' }]);
  const dropRow = (index) => setRows(rows.filter((_, at) => at !== index));

  const submit = async (event) => {
    event.preventDefault();
    if (!customer) return setError('Pick the customer this costing is for.');

    /* An empty row is somebody who pressed Add another and changed their mind, not a model. */
    const models = rows.filter((row) => row.mould || row.modelNumber.trim());
    if (!models.length) return setError('Name at least one model to cost.');

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
          lines: models.map((row) => ({
            mould: row.mould || undefined,
            modelNumber: row.modelNumber.trim() || undefined,
          })),
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
        the same costing sheet either way. One sheet holds every model the buyer asked about,
        and each of them gets its own cost, price and floor.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <CustomerSelect value={customer} onChange={setCustomer} aria-label="Customer" />
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

      <div className="space-y-3">
        <p className="eyebrow">Models to cost</p>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label={index === 0 ? 'Model' : ''} hint={index === 0 ? 'The tool it runs on — empty for a traded piece' : ''}>
              <MouldSelect
                value={row.mould}
                onChange={(mould) => setRow(index, { mould })}
                aria-label={`Model ${index + 1}`}
              />
            </Field>
            <Field
              label={index === 0 ? 'Model number' : ''}
              hint={index === 0 ? 'What the buyer calls it, or all of it if it is traded' : ''}
            >
              <input
                className="input"
                value={row.modelNumber}
                onChange={(event) => setRow(index, { modelNumber: event.target.value })}
                aria-label={`Model number ${index + 1}`}
              />
            </Field>
            {/* No remove on the only row: a sheet with nothing on it is not a costing. */}
            {rows.length > 1 ? (
              <button
                type="button"
                className="row-action mb-1"
                onClick={() => dropRow(index)}
                aria-label={`Remove model ${index + 1}`}
              >
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={addRow}>
          + Add another model
        </button>
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


/**
 * The one thing this row is waiting for.
 *
 * Which step a sheet is on is decided by its stage and by what the reader is allowed to do, and
 * both were previously left for the reader to work out from a row of three buttons. Written once
 * here so the register reads as a queue: find the job, read what happens next, do it.
 *
 * `quoted` is the live quotation already raised off this sheet, when there is one. A costing
 * raises one offer at a time — the server refuses a second — so an approved sheet that is
 * already out is not waiting for a quote, it is waiting for an answer. Saying so, and pointing
 * at the document, is the difference between a rule and a button that fails.
 */
function NextStep({ row, quoted, mayCost, mayQuote, mine, onDecide, onCost, onQuote }) {
  /*
   * A sheet of several models is worked on its own page, not in a modal from here.
   *
   * Costing and approving are per model now [§7, §9] — each line has its own cost, its own floor
   * and its own signature — so a single button on a row of five would have to pick one of them
   * for the reader, and the one it picked would be the first. The page shows which model is
   * being read and lets them choose; the row's job is to say there is a choice to make.
   */
  if ((row.lines?.length || 0) > 1) {
    const waiting = row.linesAwaitingApproval || 0;
    const approved = row.lines.filter(
      (entry) => entry.status === 'approved' && entry.approvedSellingPrice
    ).length;

    /*
     * Something approved and nothing quoted yet is the one step that still belongs on the row:
     * quoting takes every approved model onto one document, so it needs no choice made here.
     * Four settled and one waiting is offerable — the fifth is simply left off.
     */
    if (approved && !waiting && mayQuote && mine && !quoted) {
      return (
        <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={onQuote}>
          Quote {approved}
        </button>
      );
    }
    if (quoted) {
      return (
        <Link to={`/quotations/${quoted._id}`} className="btn-secondary inline-block px-3 py-1 text-xs">
          On {quoted.number}
        </Link>
      );
    }
    return (
      <Link to={`/pricings/${row._id}`} className="btn-secondary inline-block px-3 py-1 text-xs">
        {waiting ? `${waiting} to sign off` : `${row.lines.length} models`}
      </Link>
    );
  }

  if (row.status === 'approval_pending') {
    return mayCost ? (
      <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={onDecide}>
        Approve or refuse
      </button>
    ) : (
      <span className="text-xs text-steel-500">With management</span>
    );
  }

  if (quoted) {
    return (
      <Link
        to={`/quotations/${quoted._id}`}
        className="btn-secondary inline-block px-3 py-1 text-xs"
      >
        On {quoted.number}
      </Link>
    );
  }

  if (row.status === 'approved' && mayQuote) {
    /*
     * Quoting is scoped to whoever works the buyer [§29], and the register did not say so: every
     * approved sheet offered the button, and the ones for a colleague's accounts answered "that
     * customer belongs to another marketing person" once the form had been filled in. Naming
     * them is also the useful answer — it says who to ask.
     */
    if (!mine) {
      return (
        <span className="text-xs text-steel-500">
          {row.customer?.assignedTo?.name ? `${row.customer.assignedTo.name}’s buyer` : 'Another owner'}
        </span>
      );
    }

    return (
      <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={onQuote}>
        Raise a quote
      </button>
    );
  }

  if (mayCost) {
    return (
      <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={onCost}>
        {row.status === 'requested' ? 'Build it' : 'Re-cost'}
      </button>
    );
  }

  /* A marketing reader on a sheet nobody has priced yet. Saying whose move it is beats an empty
     cell, which reads as a screen that failed to draw. */
  return (
    <span className="text-xs text-steel-500">
      {row.status === 'requested' ? 'Being costed' : '—'}
    </span>
  );
}

export default function Pricings() {
  const { user, canWrite, canQuote } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [costing, setCosting] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [raising, setRaising] = useState(null);
  /* The command bar's "New …" arrives as `?new=1` with the form to open. */
  useOpenFromLink(() => setRaising(true));
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

      {loading && <TableSkeleton columns={mayCost ? 6 : 4} />}
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
                    {/*
                      No quantity column. A costing prices one piece — see the model's own note —
                      and the figure that used to sit here came off the enquiry, where nobody
                      knows how many. On a sheet of five models it was the first model's legacy
                      quantity standing for all of them, which is worse than the gap.
                    */}
                    {/* Cost and margin are virtuals — worked out on the way out of the document,
                        so there is nothing stored for the database to order by. A heading that
                        offered it would draw an arrow and not sort. */}
                    {mayCost && <th className="px-3 py-3 text-right">Cost</th>}
                    <SortHeader field="approvedSellingPrice" label="Price" sort={sort} onToggle={sortBy} align="right" />
                    {mayCost && <th className="px-3 py-3 text-right">Margin</th>}
                    <SortHeader field="status" label="Stage" sort={sort} onToggle={sortBy} />
                    {/* Pinned — see `.col-actions`. With nine columns the row's own buttons were
                        the part that fell off the end of the card. */}
                    <th className="col-actions px-3 py-3 text-right">Next step</th>
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
                      {/*
                        The models on the sheet. A costing prices several now [§7], and naming
                        only the first would let a five-model sheet read as a one-model one —
                        which is how somebody prices four hangers and quotes none of them.
                      */}
                      <td className="px-3 py-3.5 text-steel-300">
                        {row.lines?.[0]?.modelNumber || row.modelNumber || '—'}
                        {row.lines?.length > 1 && (
                          <span className="ml-1.5 text-xs text-steel-500">
                            +{row.lines.length - 1} more
                          </span>
                        )}
                      </td>
                      {mayCost && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-400">
                          {/*
                            One model's cost, and only where the sheet holds one. Two hangers
                            priced per piece have no combined cost per piece, so a figure in this
                            column on a five-model sheet would be the first model's wearing the
                            whole sheet's name. The page has them all, one at a time.
                          */}
                          {row.lines?.length > 1 ? (
                            <span className="text-xs text-steel-500">per model</span>
                          ) : (
                            rupees(row.totalCost)
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                        {row.lines?.length > 1 ? (
                          <span className="text-xs text-steel-500">
                            {row.lines.length} prices
                          </span>
                        ) : (
                          rupees(row.approvedSellingPrice)
                        )}
                        {/* Marketing's one fact about the floor: whether they may quote yet.
                            Not `belowMinimum` — a sheet MD has signed off is still under the
                            floor, and this hint beside an Approved badge reads as a block. */}
                        {(row.needsApproval || row.linesAwaitingApproval > 0) && (
                          <p className="text-xs font-semibold text-warn-400">
                            {row.linesAwaitingApproval > 1
                              ? `${row.linesAwaitingApproval} need approval`
                              : 'Needs approval'}
                          </p>
                        )}
                      </td>
                      {mayCost && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-300">
                          {row.lines?.length > 1
                            ? '—'
                            : row.grossMarginPercent === null || row.grossMarginPercent === undefined
                              ? '—'
                              : `${row.grossMarginPercent}%`}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <Badge status={row.status}>{humanise(row.status)}</Badge>
                      </td>
                      {/*
                        One button, and it is the step this row is actually waiting for.

                        There were three — Re-cost, Details, Raise a quote — and together they
                        were wider than the space the card had left, so the pinned column
                        covered the margin and the stage to make room for two buttons nobody was
                        looking for. Three choices on every row is also a worse question than
                        one: a register is read down the Costing column to find the job, and
                        what it should answer at the end of the row is "and what now".

                        Nothing is lost. The costing's own page carries the full set — quote,
                        edit the details, re-cost — and it is one click away on the number.
                      */}
                      <td className="col-actions whitespace-nowrap px-3 py-3.5 text-right">
                        <NextStep
                          row={row}
                          quoted={meta.quotedOn?.[row._id]}
                          mine={ownsRecord(user, row.customer)}
                          mayCost={mayCost}
                          mayQuote={mayQuote}
                          onDecide={() => setDeciding(row)}
                          onCost={() => setCosting(row)}
                          onQuote={() => setQuoting(row)}
                        />
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
        open={Boolean(raising)}
        title="New costing"
        description="For a job with no enquiry behind it — a tender, a repeat, a walk-in"
        size="lg"
        onClose={() => setRaising(null)}
      >
        {raising && <NewCostingForm onClose={() => setRaising(null)} onSaved={saved} />}
      </Modal>

      {/* Not "set the quantity": a quotation offers a rate against a minimum and the purchase
          order settles how many [§10]. The form has had no quantity field for some time and
          this description was still asking for one. */}
      <Modal
        open={Boolean(quoting)}
        title={`Quote from ${quoting?.number || ''}`}
        description="The customer, the model and the price come off the costing. Set the minimum and the terms"
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
