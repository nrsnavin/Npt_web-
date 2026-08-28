import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import {
  formatCompactCurrency, formatCurrency, formatDate, formatNumber, humanise,
} from '../utils/format.js';

/**
 * One quotation, in full [BLUEPRINT §10].
 *
 * The revision history is the point of this page, not a footnote on it. §10's whole demand is
 * that every revision stays — Rev 0 ₹7.50, Rev 1 ₹7.30, Rev 2 ₹7.20 — and a list of prices with
 * no sense of movement answers "what did we quote" while leaving the question people actually
 * ask unanswered: *how did we get here, and how much have we already given away?* So each
 * revision is shown against the one before it, with what changed and by how much.
 *
 * The rest of the page is what a person needs to read that history honestly: the live offer,
 * the terms it carries, and the two records behind it — the enquiry it answers and the costing
 * it was priced off.
 */

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

const FREIGHT_LABELS = {
  ex_factory: 'Ex-factory',
  fob: 'FOB',
  cif: 'CIF',
  door_delivery: 'Door delivery',
};

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

/**
 * What changed between one revision and the one before it.
 *
 * Only the fields that actually moved. A revision that lists every term it carries buries the
 * one line that matters — usually the price — in nine that did not change.
 */
function changesBetween(revision, previous) {
  if (!previous) return [];

  const fields = [
    ['Price', 'unitPrice', rupees],
    ['Quantity', 'quantity', formatNumber],
    ['MOQ', 'moq', formatNumber],
    ['Payment', 'paymentTerms', (value) => value],
    ['Delivery', 'deliveryTerms', (value) => value],
    ['Freight', 'freightTerms', (value) => FREIGHT_LABELS[value] || value],
    ['Packing', 'packing', (value) => value],
  ];

  return fields
    .filter(([, key]) => (revision[key] ?? null) !== (previous[key] ?? null))
    .map(([label, key, show]) => ({
      label,
      from: previous[key] === undefined || previous[key] === null ? '—' : show(previous[key]),
      to: revision[key] === undefined || revision[key] === null ? '—' : show(revision[key]),
    }));
}

export default function QuotationDetail() {
  const { id } = useParams();
  const fetch = useCallback((quotationId) => quotationsApi.get(quotationId), []);
  const { data: quotation, loading, error, reload } = useRecord(fetch, id);
  const [showingPdf, setShowingPdf] = useState(false);

  if (loading) return <Spinner label="Loading the quotation" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!quotation) return null;

  const revisions = [...(quotation.revisions || [])].reverse();
  const first = quotation.revisions?.[0];

  /*
   * What the negotiation has cost so far, which is the number nobody works out by hand. Six
   * weeks of small concessions read as small; the total rarely does.
   */
  const opening = first?.unitPrice;
  const given =
    opening && quotation.unitPrice ? ((quotation.unitPrice - opening) / opening) * 100 : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={quotation.number}
        subtitle={
          <>
            {quotation.customer?.name}
            {quotation.modelNumber ? ` · ${quotation.modelNumber}` : ''} ·{' '}
            {formatNumber(quotation.quantity)} pcs · Rev {quotation.revision ?? 0}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setShowingPdf(true)}>
              View the document
            </button>
            <Badge status={quotation.status}>{humanise(quotation.status)}</Badge>
          </div>
        }
      />

      {quotation.isExpired && (
        <Notice tone="warn">
          The validity on this quote passed on {formatDate(quotation.validUntil)}. It needs a new
          revision before the customer can act on it.
        </Notice>
      )}

      {quotation.status === 'approval_pending' && (
        <Notice tone="warn">
          This price is waiting on management approval and cannot go out until it is settled [§9].
        </Notice>
      )}

      {quotation.status === 'rejected' && quotation.rejectionNote && (
        <Notice tone="danger">The customer turned it down: {quotation.rejectionNote}</Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* ------------------------------ The live offer ------------------------------ */}
          <Section title="What is on offer now">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="card px-4 py-3">
                <p className="eyebrow">Unit price</p>
                <p className="stat-value mt-1 text-steel-50">{rupees(quotation.unitPrice)}</p>
                <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                  Rev {quotation.revision ?? 0}
                </p>
              </div>
              <div className="card px-4 py-3">
                <p className="eyebrow">Quantity</p>
                <p className="stat-value mt-1 text-steel-50">
                  {formatNumber(quotation.quantity)}
                </p>
                {quotation.moq ? (
                  <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                    Minimum {formatNumber(quotation.moq)}
                  </p>
                ) : null}
              </div>
              <div className="card px-4 py-3">
                <p className="eyebrow">Order value</p>
                <p className="stat-value mt-1 text-steel-50">
                  {formatCompactCurrency(quotation.totalValue)}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                  {/* Export is a different basis, not GST at zero — see the model. */}
                  {quotation.isExport
                    ? 'Export — no GST'
                    : quotation.gstPercent
                      ? `incl. ${quotation.gstPercent}% GST`
                      : 'GST extra as applicable'}
                </p>
              </div>
            </div>

            <dl className="mt-4 space-y-3 border-t border-line/[0.06] pt-4 text-sm">
              <Fact label="Net value" value={formatCurrency(quotation.lineValue)} />
              <Fact label="Payment terms" value={quotation.paymentTerms} />
              <Fact label="Delivery" value={quotation.deliveryTerms} />
              <Fact
                label="Freight"
                value={FREIGHT_LABELS[quotation.freightTerms] || quotation.freightTerms}
              />
              <Fact label="Packing" value={quotation.packing} />
              <Fact
                label="Valid until"
                value={quotation.validUntil && formatDate(quotation.validUntil)}
              />
              <Fact label="Remarks" value={quotation.remarks} />
            </dl>
          </Section>

          {/* ---------------------------- The revisions [§10] ---------------------------- */}
          <Section title={`What has been offered (${revisions.length})`}>
            {/*
              The whole negotiation in one figure. Individual concessions always look small;
              the sum of them is the thing worth seeing before giving another.
            */}
            {given !== null && revisions.length > 1 && (
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-line/[0.08] bg-line/[0.02] px-4 py-3">
                <span className="text-xs uppercase tracking-wide text-steel-500">
                  Since Rev 0
                </span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    given < 0 ? 'text-warn-400' : given > 0 ? 'text-ok-400' : 'text-steel-100'
                  }`}
                >
                  {given > 0 ? '+' : ''}
                  {given.toFixed(1)}%
                </span>
                <span className="text-xs text-steel-400">
                  {rupees(opening)} → {rupees(quotation.unitPrice)}
                </span>
              </div>
            )}

            <ol className="space-y-3">
              {revisions.map((revision, index) => {
                const previous = revisions[index + 1];
                const changes = changesBetween(revision, previous);
                const live = revision.revision === quotation.revision;

                return (
                  <li
                    key={revision.revision}
                    className={`rounded-lg border px-3.5 py-3 ${
                      live ? 'border-flame-500/40 bg-flame-500/[0.04]' : 'border-line/[0.06]'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-3">
                        <span className="text-sm font-bold text-steel-100">
                          Rev {revision.revision}
                        </span>
                        <span className="text-base font-bold tabular-nums text-steel-50">
                          {rupees(revision.unitPrice)}
                        </span>
                        {revision.quantity ? (
                          <span className="text-xs text-steel-400">
                            {formatNumber(revision.quantity)} pcs
                          </span>
                        ) : null}
                        {live && (
                          <span className="text-[0.625rem] font-bold uppercase tracking-wide text-flame-400">
                            Live
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-steel-500">
                        {revision.by?.name ? `${revision.by.name} · ` : ''}
                        {formatDate(revision.at)}
                        {revision.sentAt ? ` · sent ${formatDate(revision.sentAt)}` : ''}
                      </span>
                    </div>

                    {changes.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {changes.map((change) => (
                          <li key={change.label} className="text-xs text-steel-400">
                            <span className="text-steel-500">{change.label}</span>{' '}
                            <span className="line-through opacity-60">{change.from}</span>{' '}
                            <span className="text-steel-200">→ {change.to}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {revision.remarks && (
                      <p className="mt-1.5 text-xs text-steel-400">{revision.remarks}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>

        {/* --------------------------------- The side --------------------------------- */}
        <div className="space-y-5">
          <Section title="This quotation">
            <dl className="space-y-3 text-sm">
              <Fact label="Customer" value={quotation.customer?.name} />
              <Fact label="Customer no." value={quotation.customer?.code} />
              <Fact
                label="Where"
                value={[quotation.customer?.city, quotation.customer?.state]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Fact label="Owner" value={quotation.assignedTo?.name} />
              <Fact label="Raised" value={formatDate(quotation.createdAt)} />
              <Fact label="Sent" value={quotation.sentAt && formatDate(quotation.sentAt)} />
              <Fact
                label="Answered"
                value={quotation.respondedAt && formatDate(quotation.respondedAt)}
              />
            </dl>
          </Section>

          {/*
            The two records behind the quote. Without them the trail stops here: whoever asks
            "why this price?" has to go and find the costing by hand.
          */}
          <Section title="Where it came from">
            <dl className="space-y-3 text-sm">
              <Fact
                label="Enquiry"
                value={
                  quotation.enquiry ? (
                    <Link
                      to={`/enquiries/${quotation.enquiry._id}`}
                      className="text-steel-100 hover:text-accent"
                    >
                      {quotation.enquiry.number}
                    </Link>
                  ) : (
                    'Raised on its own'
                  )
                }
              />
              <Fact
                label="Costing"
                value={
                  quotation.pricing ? (
                    <Link
                      to={`/pricings/${quotation.pricing._id}`}
                      className="text-steel-100 hover:text-accent"
                    >
                      {quotation.pricing.number}
                    </Link>
                  ) : (
                    'Quoted from a known price'
                  )
                }
              />
              {/*
                The price the costing sanctioned, beside the one being quoted. §8 lets marketing
                see this figure — it is the price they may quote — and the gap between the two
                is the discount somebody gave, which is otherwise invisible on the quotation.
              */}
              <Fact
                label="Approved price"
                value={
                  quotation.pricing?.approvedSellingPrice &&
                  rupees(quotation.pricing.approvedSellingPrice)
                }
              />
              <Fact
                label="Model"
                value={
                  quotation.product
                    ? `${quotation.product.modelCode} — ${quotation.product.name}`
                    : quotation.modelNumber
                }
              />
            </dl>

            {quotation.pricing?.approvedSellingPrice &&
              quotation.unitPrice < quotation.pricing.approvedSellingPrice && (
                <p className="mt-3 text-xs text-warn-400">
                  This is being quoted under the approved price of{' '}
                  {rupees(quotation.pricing.approvedSellingPrice)}.
                </p>
              )}
          </Section>

          <Section title={`History (${quotation.statusHistory?.length || 0})`}>
            {quotation.statusHistory?.length ? (
              <ol className="space-y-3">
                {[...quotation.statusHistory].reverse().map((entry, index) => (
                  <li key={`${entry.to}-${entry.at}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-flame-500" />
                    <div className="min-w-0">
                      <p className="text-sm text-steel-100">
                        {entry.from ? `${humanise(entry.from)} → ` : ''}
                        <span className="font-semibold">{humanise(entry.to)}</span>
                      </p>
                      <p className="text-xs text-steel-500">
                        {entry.by?.name ? `${entry.by.name} · ` : ''}
                        {formatDate(entry.at)}
                      </p>
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

      <QuotationPdf
        quotation={quotation}
        open={showingPdf}
        onClose={() => setShowingPdf(false)}
      />
    </div>
  );
}
