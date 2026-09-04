import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Modal, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import CostingSheetForm from '../components/CostingSheetForm.jsx';
import CostingDetailsForm from '../components/CostingDetailsForm.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import { HANGER_CATEGORIES, HOOK_TYPES, optionLabel } from '../utils/pipeline.js';

/**
 * One costing sheet, in full [BLUEPRINT §7, §8, §9].
 *
 * The list answers "which costings exist"; this answers the only question anyone actually
 * brings to a costing — **is this price right?** — and that question is never answerable from
 * the sheet alone. It needs three things beside it: what the buyer asked to pay, what the
 * model's own standard on the register is, and what has already been quoted off this price. All
 * three arrive with the record, so the page cannot show half a story while the rest loads.
 *
 * §8 governs the whole screen. The server has already removed the cost base, the margin and
 * the floor for anyone without `pricing: write`, so a marketing reader sees a shorter page
 * rather than a broken one — and the page says why it is shorter, because a gap nobody
 * explains reads as a fault.
 */

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

const paise = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(3)}`;

/** One line of the per-piece build-up. */
function CostLine({ label, hint, note, value, share, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={`text-sm ${strong ? 'font-bold text-steel-50' : 'text-steel-200'}`}>{label}</p>
        {hint && <p className="text-[0.6875rem] text-steel-500">{hint}</p>}
        {/* Where a figure came from, when it came from somewhere rather than from a keyboard. */}
        {note && <p className="text-[0.6875rem] text-flame-400/80">{note}</p>}
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        {/*
          The share of the total, which is the number that actually starts conversations. A
          costing where the hook is 40% of the piece is a costing worth arguing about, and that
          is invisible when the lines are only rupees.
        */}
        {share !== null && share !== undefined && (
          <span className="w-10 text-right text-[0.6875rem] tabular-nums text-steel-500">
            {share > 0 ? `${share.toFixed(0)}%` : ''}
          </span>
        )}
        <span
          className={`w-20 text-right tabular-nums ${
            strong ? 'text-base font-bold text-steel-50' : 'text-sm text-steel-100'
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export default function PricingDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const mayCost = canWrite('pricing');

  const fetch = useCallback((pricingId) => pricingsApi.get(pricingId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);
  const [editing, setEditing] = useState(null);
  /*
   * The document being previewed, if any.
   *
   * Kept here rather than one piece of state per row: only one can be open, and a flag on each
   * row is a set of booleans that can disagree with each other.
   *
   * Declared with the other hooks, above the early returns, because that is the only place a
   * hook may live. It sat below them until now, which meant the first render — the loading one
   * — ran two hooks and the second ran three: React counts them, and the page died with
   * "rendered more hooks than during the previous render" the moment the costing arrived.
   */
  const [previewing, setPreviewing] = useState(null);

  if (loading) return <Spinner label="Loading the costing" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.data) return null;

  const pricing = data.data;
  const quotations = data.quotations || [];
  const cost = pricing.cost || {};

  const total = pricing.totalCost || 0;
  const share = (value) => (total ? ((Number(value) || 0) / total) * 100 : 0);

  /* What the buyer wanted against what they will be offered — the gap that decides the job. */
  const target = pricing.enquiry?.targetPrice ?? pricing.targetPrice;
  const asking = pricing.approvedSellingPrice;
  const gap = target && asking ? ((asking - target) / target) * 100 : null;

  /*
   * Where the gram weight came from, when it came off a tool.
   *
   * Worth a line of its own because the figure on the sheet is deliberately *not* the part
   * weight: a piece off a four-cavity tool with a 12 g runner weighs 30 g and consumes 33.
   * Without this, the first person to compare the two assumes the sheet is wrong and corrects
   * it downwards, which is the error the register exists to prevent.
   */
  const mould = pricing.mould;
  const fromTool =
    mould && cost.gramWeight
      ? `${mould.mouldCode} — ${mould.partWeightGrams}g part + ${(
          cost.gramWeight - mould.partWeightGrams
        ).toFixed(2)}g runner share, ${mould.runningCavities ?? mould.cavities} up`
      : null;

  const lines = [
    {
      label: 'Raw material',
      hint:
        cost.gramWeight && cost.rawMaterialRate
          ? `${cost.gramWeight}g × ₹${cost.rawMaterialRate}/kg ÷ 1000`
          : 'Not entered',
      value: pricing.materialCost,
      note: fromTool,
    },
    { label: 'Job work', value: cost.jobWorkCost },
    { label: 'Hook', value: cost.hookCost },
    { label: 'Metal clips', value: cost.metalClipsCost },
    { label: 'Print price', value: cost.printingCost },
    { label: 'Packing', value: cost.packingCost },
    { label: 'Anything else', value: cost.otherCost },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={pricing.number}
        subtitle={
          <>
            {pricing.customer?.name}
            {pricing.modelNumber ? ` · ${pricing.modelNumber}` : ''} ·{' '}
            {formatNumber(pricing.quantity)} pcs
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {mayCost && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditing('details')}
                >
                  Edit details
                </button>
                {/*
                  Offered on a settled sheet too. A costing goes stale for ordinary reasons —
                  the resin rate moves, a gram weight was mistyped — and correcting the sheet
                  beats abandoning it for a second one nobody can tell apart. §9 re-runs on
                  save, so a price that no longer clears the floor goes back for signature.
                */}
                {pricing.status !== 'approval_pending' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditing('sheet')}
                  >
                    {pricing.status === 'requested' ? 'Build the costing' : 'Re-cost'}
                  </button>
                )}
              </>
            )}
            <Badge status={pricing.status}>{humanise(pricing.status)}</Badge>
          </div>
        }
      />

      {pricing.needsApproval && (
        <Notice tone="warn">
          This price is below the approved minimum. Nothing can be quoted from it until
          management signs it off [§9].
        </Notice>
      )}

      {pricing.status === 'rejected' && pricing.rejectionNote && (
        <Notice tone="danger">Refused: {pricing.rejectionNote}</Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* ------------------------------ The unit price ------------------------------ */}
          <Section title="What one piece costs">
            {mayCost ? (
              <>
                <div className="divide-y divide-line/[0.04]">
                  {lines.map((line) => (
                    <CostLine
                      key={line.label}
                      label={line.label}
                      hint={line.hint}
                      note={line.note}
                      value={paise(line.value)}
                      share={share(line.value)}
                    />
                  ))}
                </div>

                <div className="mt-1 border-t border-line/[0.1] pt-1">
                  <CostLine label="Total cost per piece" value={paise(total)} share={100} strong />
                </div>

                {/*
                  The three prices are three different things, and the sheet is only readable
                  when they are shown as such: one is arithmetic, one is a decision, one is a
                  limit.
                */}
                {/*
                  The standing tiers as the sheet shows them, with the one this costing is
                  working to marked. A single calculated price would hide the choice, and the
                  choice is the pricing.
                */}
                <div className="mt-4">
                  <p className="eyebrow mb-2">Cost plus</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[10, 15, 20].map((percent) => {
                      const chosen = (pricing.markupPercent ?? 10) === percent;
                      return (
                        <div
                          key={percent}
                          className={`card px-4 py-3 ${chosen ? 'ring-1 ring-flame-500/50' : ''}`}
                        >
                          <p className="eyebrow">
                            {percent}%{percent === 10 ? ' · floor' : ''}
                          </p>
                          <p className={`stat-value mt-1 ${chosen ? 'text-flame-400' : 'text-steel-50'}`}>
                            {rupees(pricing.tiers?.[percent])}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Approved</p>
                    <p className="stat-value mt-1 text-steel-50">{rupees(asking)}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                      {pricing.effectiveMarkupPercent === null ||
                      pricing.effectiveMarkupPercent === undefined
                        ? 'What marketing may quote'
                        : `Cost plus ${pricing.effectiveMarkupPercent}% — what marketing may quote`}
                    </p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Floor [§9]</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {rupees(pricing.minimumSellingPrice)}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                      {pricing.minimumOverride == null
                        ? 'The 10% tier, by standing policy'
                        : 'Set for this job'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Margin on the approved price</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {pricing.grossMarginPercent === null ||
                      pricing.grossMarginPercent === undefined
                        ? '—'
                        : `${pricing.grossMarginPercent}%`}
                    </p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Value of the costed lot</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {formatCompactCurrency((asking || 0) * (pricing.quantity || 0))}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                      {formatNumber(pricing.quantity)} pcs at {rupees(asking)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Price you may quote</p>
                    <p className="stat-value mt-1 text-steel-50">{rupees(asking)}</p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Value of the costed lot</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {formatCompactCurrency((asking || 0) * (pricing.quantity || 0))}
                    </p>
                  </div>
                </div>
                {/* Said plainly, because a page that is quietly short reads as a page that is
                    broken. */}
                <p className="mt-4 text-xs leading-relaxed text-steel-500">
                  The cost base, the margin and the minimum price are management&rsquo;s [§8].
                  What you see is the price you may quote, and whether it is cleared to go out.
                </p>
              </>
            )}
          </Section>

          {/* --------------------------- What was asked for --------------------------- */}
          {(target || pricing.enquiry) && (
            <Section title="Against what the buyer asked">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="card px-4 py-3">
                  <p className="eyebrow">They asked for</p>
                  <p className="stat-value mt-1 text-steel-50">{rupees(target)}</p>
                </div>
                <div className="card px-4 py-3">
                  <p className="eyebrow">We will offer</p>
                  <p className="stat-value mt-1 text-steel-50">{rupees(asking)}</p>
                </div>
                <div className="card px-4 py-3">
                  <p className="eyebrow">Gap</p>
                  <p
                    className={`stat-value mt-1 ${
                      gap === null ? 'text-steel-50' : gap > 0 ? 'text-warn-400' : 'text-success-400'
                    }`}
                  >
                    {gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)}%`}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                    {gap === null
                      ? 'No target on record'
                      : gap > 0
                        ? 'Above what they wanted'
                        : 'At or under their target'}
                  </p>
                </div>
              </div>
            </Section>
          )}

          {/* ------------------------------ What was quoted ------------------------------ */}
          <Section title={`Quoted from this costing (${quotations.length})`}>
            {quotations.length === 0 ? (
              <p className="text-sm text-steel-400">
                Nothing has gone out against this price yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {quotations.map((quote) => (
                  <li
                    key={quote._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/quotations/${quote._id}`}
                        className="text-sm font-semibold text-steel-100 hover:text-accent"
                      >
                        {quote.number}
                      </Link>
                      <p className="text-xs text-steel-400">
                        {/*
                          The line off *this* costing, not the document total. A quotation can
                          carry eight models and only one of them was priced here — showing the
                          document's value against this sheet would read as a costing that
                          produced eight times the business it did.
                        */}
                        Rev {quote.revision ?? 0} ·{' '}
                        {(() => {
                          const line =
                            (quote.lines || []).find(
                              (row) => String(row.pricing) === String(pricing._id)
                            ) || quote.lines?.[0];
                          if (!line) return '—';
                          return `${formatNumber(line.quantity)} pcs · ${rupees(line.unitPrice)}${
                            line.moq ? ` · min ${formatNumber(line.moq)}` : ''
                          }`;
                        })()}
                        {quote.lines?.length > 1 ? ` · with ${quote.lines.length - 1} other model(s)` : ''}
                        {/* Worth surfacing: a quote below the sheet's own approved price is a
                            discount somebody gave, and it is invisible on the quotation. */}
                        {asking &&
                        (quote.lines || []).some(
                          (row) =>
                            String(row.pricing) === String(pricing._id) && row.unitPrice < asking
                        )
                          ? ' · under the approved price'
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/*
                        * The document itself, from the costing that priced it.
                        *
                        * Worth the click being here: checking what a buyer was actually sent is
                        * the reason anybody opens a costing months later, and the alternative
                        * was opening the quotation to reach the same viewer one step further on.
                        */}
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => setPreviewing(quote)}
                      >
                        PDF
                      </button>
                      <Badge status={quote.status}>{humanise(quote.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <QuotationPdf
            quotation={previewing}
            open={Boolean(previewing)}
            onClose={() => setPreviewing(null)}
          />
        </div>

        {/* --------------------------------- The side --------------------------------- */}
        <div className="space-y-5">
          <Section title="This costing">
            <dl className="space-y-3 text-sm">
              <Fact label="Customer" value={pricing.customer?.name} />
              <Fact label="Model" value={pricing.modelNumber} />
              <Fact
                label="Enquiry"
                value={
                  pricing.enquiry ? (
                    <Link
                      to={`/enquiries/${pricing.enquiry._id}`}
                      className="text-steel-100 hover:text-accent"
                    >
                      {pricing.enquiry.number}
                    </Link>
                  ) : (
                    'Raised on its own'
                  )
                }
              />
              <Fact label="Quantity costed" value={`${formatNumber(pricing.quantity)} pcs`} />
              <Fact label="Material" value={pricing.material?.toUpperCase()} />
              <Fact
                label="Trade or manufacture"
                value={pricing.procurement && humanise(pricing.procurement)}
              />
              <Fact label="Printing" value={pricing.printing} />
              <Fact label="Asked by" value={pricing.requestedBy?.name} />
              <Fact label="Asked on" value={formatDate(pricing.requestedAt)} />
              <Fact label="Costed by" value={pricing.costedBy?.name} />
              <Fact
                label="Signed off"
                value={
                  pricing.approvedAt
                    ? `${pricing.approvedBy?.name || '—'} · ${formatDate(pricing.approvedAt)}`
                    : null
                }
              />
              <Fact label="Remarks" value={pricing.remarks} />
            </dl>
          </Section>

          {/*
            What the register says the model is, so the sheet can be read against it rather
            than in isolation. The minimum is shown here and set on the quotation, never on the
            costing — it is a term of the offer rather than a fact about the cost.

            Absent for a traded piece, which has no tool. That is not a gap worth an empty
            panel: the model number on the sheet is the whole of what identifies it.
          */}
          {mould && (
            <Section title="From the register">
              <dl className="space-y-3 text-sm">
                <Fact label="Mould" value={`${mould.mouldCode} — ${mould.name}`} />
                <Fact label="Category" value={optionLabel(HANGER_CATEGORIES, mould.category)} />
                <Fact label="Size" value={mould.sizeMm && `${mould.sizeMm} mm`} />
                <Fact label="Hook" value={optionLabel(HOOK_TYPES, mould.hookType)} />
                <Fact label="Resin" value={mould.material && mould.material.toUpperCase()} />
                <Fact
                  label="Standard minimum"
                  value={mould.moq ? `${formatNumber(mould.moq)} pcs` : null}
                />
                <Fact
                  label="Packing"
                  value={mould.packingQty ? `${formatNumber(mould.packingQty)} per carton` : null}
                />
              </dl>
            </Section>
          )}

          <Section title={`History (${pricing.statusHistory?.length || 0})`}>
            {pricing.statusHistory?.length ? (
              <ol className="space-y-3">
                {[...pricing.statusHistory].reverse().map((entry, index) => (
                  <li key={`${entry.to}-${entry.at}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-flame-500" />
                    <div className="min-w-0">
                      <p className="text-sm text-steel-100">
                        {entry.from ? `${humanise(entry.from)} → ` : ''}
                        <span className="font-semibold">{humanise(entry.to)}</span>
                      </p>
                      <p className="text-xs text-steel-500">{formatDate(entry.at)}</p>
                      {entry.note && (
                        <p className="mt-0.5 text-xs text-steel-400">{entry.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-steel-400">Nothing recorded yet.</p>
            )}
          </Section>
        </div>
      </div>

      <Modal
        open={editing === 'details'}
        title={`Details of ${pricing.number}`}
        description="What this costing is for. The cost lines are on the sheet itself"
        size="lg"
        onClose={() => setEditing(null)}
      >
        <CostingDetailsForm
          pricing={pricing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      </Modal>

      <Modal
        open={editing === 'sheet'}
        title={`Costing ${pricing.number}`}
        description="Every line is per piece. The calculated price is worked out, not typed"
        size="lg"
        onClose={() => setEditing(null)}
      >
        <CostingSheetForm
          pricing={pricing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      </Modal>
    </div>
  );
}

/** One label-and-value row, skipped entirely when there is nothing to say. */
function Fact({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-steel-500">{label}</dt>
      <dd className="min-w-0 text-right text-steel-100">{value}</dd>
    </div>
  );
}
