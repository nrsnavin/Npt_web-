import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Modal, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import CostingSheetForm from '../components/CostingSheetForm.jsx';
import CostingDetailsForm from '../components/CostingDetailsForm.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';

/**
 * One costing sheet, in full [BLUEPRINT §7, §8, §9].
 *
 * The list answers "which costings exist"; this answers the only question anyone actually
 * brings to a costing — **is this price right?** — and that question is never answerable from
 * the sheet alone. It needs three things beside it: what the buyer asked to pay, what the
 * model's own catalogue standard is, and what has already been quoted off this price. All
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
function CostLine({ label, hint, value, share, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={`text-sm ${strong ? 'font-bold text-steel-50' : 'text-steel-200'}`}>{label}</p>
        {hint && <p className="text-[0.6875rem] text-steel-500">{hint}</p>}
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

  if (loading) return <Spinner label="Loading the costing" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.data) return null;

  const pricing = data.data;
  const quotations = data.quotations || [];
  const product = pricing.product;
  const cost = pricing.cost || {};

  const total = pricing.totalCost || 0;
  const share = (value) => (total ? ((Number(value) || 0) / total) * 100 : 0);

  /* What the buyer wanted against what they will be offered — the gap that decides the job. */
  const target = pricing.enquiry?.targetPrice ?? pricing.targetPrice;
  const asking = pricing.approvedSellingPrice;
  const gap = target && asking ? ((asking - target) / target) * 100 : null;

  const lines = [
    {
      label: 'Raw material',
      hint:
        cost.gramWeight && cost.rawMaterialRate
          ? `${cost.gramWeight}g × ₹${cost.rawMaterialRate}/kg ÷ 1000`
          : 'Not entered',
      value: pricing.materialCost,
    },
    { label: 'Production', value: cost.productionCost },
    { label: 'Printing', value: cost.printingCost },
    { label: 'Hook / clip', value: cost.hookCost },
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
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Calculated</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {rupees(pricing.calculatedSellingPrice)}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                      Cost at {pricing.targetMargin || 0}% margin
                    </p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Approved</p>
                    <p className="stat-value mt-1 text-steel-50">{rupees(asking)}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                      What marketing may quote
                    </p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Minimum</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {rupees(pricing.minimumSellingPrice)}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-steel-500">The floor [§9]</p>
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
                      gap === null ? 'text-steel-50' : gap > 0 ? 'text-warn-400' : 'text-ok-400'
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
                      <p className="text-sm font-semibold text-steel-100">{quote.number}</p>
                      <p className="text-xs text-steel-400">
                        Rev {quote.revision ?? 0} · {formatNumber(quote.quantity)} pcs ·{' '}
                        {rupees(quote.unitPrice)}
                        {quote.moq ? ` · min ${formatNumber(quote.moq)}` : ''}
                        {/* Worth surfacing: a quote below the sheet's own approved price is a
                            discount somebody gave, and it is invisible on the quotation. */}
                        {asking && quote.unitPrice < asking ? ' · under the approved price' : ''}
                      </p>
                    </div>
                    <Badge status={quote.status}>{humanise(quote.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
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
              <Fact label="Material" value={pricing.material && humanise(pricing.material)} />
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
            The catalogue standard, so the sheet can be read against the model rather than in
            isolation. The MOQ lives here and on the quotation, not on the costing — it is a
            term of the offer rather than a fact about the cost.
          */}
          {product && (
            <Section title="From the model master">
              <dl className="space-y-3 text-sm">
                <Fact label="Model" value={`${product.modelCode} — ${product.name}`} />
                <Fact label="Size" value={product.sizeMm && `${product.sizeMm} mm`} />
                <Fact label="Material" value={product.material && product.material.toUpperCase()} />
                <Fact
                  label="Standard price"
                  value={product.standardPrice ? rupees(product.standardPrice) : null}
                />
                <Fact
                  label="Catalogue MOQ"
                  value={product.moq ? `${formatNumber(product.moq)} pcs` : null}
                />
                <Fact
                  label="Packing"
                  value={product.packingQty ? `${formatNumber(product.packingQty)} per carton` : null}
                />
              </dl>
              {product.standardPrice && asking && (
                <p className="mt-3 text-xs text-steel-500">
                  This costing is{' '}
                  {asking >= product.standardPrice ? 'at or above' : 'below'} the catalogue
                  standard of {rupees(product.standardPrice)}.
                </p>
              )}
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
