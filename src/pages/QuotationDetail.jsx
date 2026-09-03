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

  /*
   * The lines first, compared as a set: on a multi-model quote the interesting change is which
   * models moved, and a field-by-field diff of a list cannot say that.
   */
  const priced = (revision.lines || [])
    .filter((line) => {
      const before = (previous.lines || []).find((other) => other.modelNumber === line.modelNumber);
      return before && before.unitPrice !== line.unitPrice;
    })
    .map((line) => {
      const before = previous.lines.find((other) => other.modelNumber === line.modelNumber);
      return `${line.modelNumber || 'Line'} ${rupees(before.unitPrice)} → ${rupees(line.unitPrice)}`;
    });

  const fields = [
    ['Payment', 'paymentTerms', (value) => value],
    ['Delivery', 'deliveryTerms', (value) => value],
    ['Freight', 'freightTerms', (value) => FREIGHT_LABELS[value] || value],
    ['Packing', 'packing', (value) => value],
  ];

  const termChanges = fields
    .filter(([, key]) => (revision[key] ?? null) !== (previous[key] ?? null))
    .map(([label, key, show]) => ({
      label,
      from: previous[key] === undefined || previous[key] === null ? '—' : show(previous[key]),
      to: revision[key] === undefined || revision[key] === null ? '—' : show(revision[key]),
    }));

  /* Price moves first — they are what the reader came for — then the terms that shifted. */
  return [
    ...priced.map((text) => ({ label: 'Price', from: null, to: text })),
    ...termChanges,
  ];
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
  /* Off the whole document, since that is what the negotiation is actually about. */
  const opening = (first?.lines || []).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const given = opening && quotation.netValue ? ((quotation.netValue - opening) / opening) * 100 : null;

  const sole = quotation.lines?.length === 1 ? quotation.lines[0] : null;

  /** The lines that came off a costing — the only ones §9's floor has anything to say about. */
  const costed = (quotation.lines || []).filter((line) => line.pricing);

  /** Lines priced under what their own costing sanctioned — the discount somebody gave. */
  const under = costed.filter(
    (line) =>
      line.pricing.approvedSellingPrice && line.unitPrice < line.pricing.approvedSellingPrice
  );

  /** Lines quoted under their floor [§9]. Marketing gets this flag without the figure. */
  const belowFloor = costed.filter((line) => line.pricing.belowFloor);

  /*
   * The lines whose costing came back with figures on it.
   *
   * The test is whether the *server* sent a cost, not what this reader's grants say. §8 is
   * decided once, on the way out, and a screen that re-decides it is a second copy of the rule
   * that can disagree with the first — always in the direction of showing something it should
   * not. Render what arrived.
   */
  const withMargin = costed.filter((line) => line.pricing.totalCost !== undefined);

  const earned = withMargin.reduce(
    (sum, line) => sum + (line.unitPrice - line.pricing.totalCost) * line.quantity,
    0
  );
  const takings = withMargin.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={quotation.number}
        subtitle={
          <>
            {quotation.customer?.name} ·{' '}
            {sole
              ? `${sole.modelNumber || 'one model'} · ${formatNumber(sole.quantity)} pcs`
              : `${quotation.lines?.length ?? 0} models`}{' '}
            · Rev {quotation.revision ?? 0}
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
            {/*
              The lines, as the document lays them out. A quotation covering eight models is a
              table, not three summary cards — the buyer quotes item numbers back at you, and
              the person answering the phone needs the same rows in front of them.
            */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Net value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {(quotation.lines || []).map((line, index) => (
                    <tr key={line._id || index}>
                      <td className="px-3 py-2.5 tabular-nums text-steel-500">{(index + 1) * 10}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-steel-100">{line.modelNumber || '—'}</p>
                        {line.product?.name && (
                          <p className="text-[0.6875rem] text-steel-500">{line.product.name}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-steel-200">
                        {formatNumber(line.quantity)}
                        {line.moq ? (
                          <p className="text-[0.6875rem] text-steel-500">
                            min {formatNumber(line.moq)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-steel-100">
                        {rupees(line.unitPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-steel-100">
                        {formatCurrency(line.quantity * line.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/*
              * What the plant makes on this document.
              *
              * Kept out of the table above on purpose: that one is the quotation as the buyer
              * receives it, item numbers and all, and putting a margin column in it would make
              * the screen stop being a picture of what was sent. This is the other question —
              * "and what do we earn" — asked once, underneath.
              *
              * Drawn only when the reply carried costs, which is §8 deciding rather than this
              * screen. Margin is against the price on the *line*: the costing knows what it
              * would have earned at the price it sanctioned, and nobody is being charged that.
              */}
            {withMargin.length > 0 && (
              <div className="mt-5 rounded-xl border border-line/[0.06] bg-ink-900/30 p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="eyebrow">What we earn on it</p>
                  <p className="text-xs text-steel-500">
                    Costing figures — not on the document sent to the buyer
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="table-head">
                      <tr>
                        <th className="px-3 py-2 text-left">Model</th>
                        <th className="px-3 py-2 text-right">Quoted</th>
                        <th className="px-3 py-2 text-right">Cost</th>
                        <th className="px-3 py-2 text-right">Margin / pc</th>
                        <th className="px-3 py-2 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/[0.04]">
                      {withMargin.map((line) => (
                        <tr key={line._id}>
                          <td className="px-3 py-2.5">
                            <Link
                              to={`/pricings/${line.pricing._id}`}
                              className="text-steel-100 hover:text-accent"
                            >
                              {line.modelNumber || line.pricing.number}
                            </Link>
                            {line.pricing.belowFloor && (
                              <p className="text-[0.6875rem] text-danger-400">
                                under its floor of {rupees(line.pricing.minimumSellingPrice)}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-steel-100">
                            {rupees(line.unitPrice)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-steel-300">
                            {rupees(line.pricing.totalCost)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-steel-200">
                            {rupees(line.pricing.marginPerPiece)}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                              line.pricing.belowFloor ? 'text-danger-400' : 'text-steel-100'
                            }`}
                          >
                            {line.pricing.marginPercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/*
                      * Blended, not averaged. A 40,000-piece line at 9% and a 500-piece line at
                      * 30% do not make 19.5% — the money says 9-point-something, and an average
                      * of percentages is how a thin quotation gets signed off as a healthy one.
                      */}
                    <tfoot>
                      <tr className="border-t border-line/[0.08]">
                        <td className="px-3 py-2.5 text-steel-400">
                          Across {withMargin.length === 1 ? 'the line' : `${withMargin.length} lines`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-steel-300">
                          {formatCurrency(takings)}
                        </td>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-right tabular-nums text-steel-200">
                          {formatCurrency(earned)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-steel-100">
                          {takings ? `${Math.round((earned / takings) * 1000) / 10}%` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {withMargin.length < costed.length && (
                  <p className="mt-3 text-xs text-steel-500">
                    {costed.length - withMargin.length} more line(s) name a costing that has not
                    been built yet, so they are not counted above.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="card px-4 py-3">
                <p className="eyebrow">Net value</p>
                <p className="stat-value mt-1 text-steel-50">{formatCurrency(quotation.netValue)}</p>
                <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                  {quotation.lines?.length ?? 0}{' '}
                  {quotation.lines?.length === 1 ? 'model' : 'models'} · Rev {quotation.revision ?? 0}
                </p>
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
                    given < 0 ? 'text-warn-400' : given > 0 ? 'text-success-400' : 'text-steel-100'
                  }`}
                >
                  {given > 0 ? '+' : ''}
                  {given.toFixed(1)}%
                </span>
                <span className="text-xs text-steel-400">
                  {formatCurrency(opening)} → {formatCurrency(quotation.netValue)}
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
                          {revision.lines?.length === 1
                            ? rupees(revision.lines[0].unitPrice)
                            : formatCurrency(
                                (revision.lines || []).reduce(
                                  (sum, line) => sum + line.quantity * line.unitPrice,
                                  0
                                )
                              )}
                        </span>
                        <span className="text-xs text-steel-400">
                          {revision.lines?.length === 1
                            ? `${formatNumber(revision.lines[0].quantity)} pcs`
                            : `${revision.lines?.length ?? 0} models`}
                        </span>
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
                        {/* A price entry already reads "MODEL old → new", so it has no separate
                            from/to to strike through. */}
                        {changes.map((change, at) => (
                          <li key={`${change.label}-${at}`} className="text-xs text-steel-400">
                            <span className="text-steel-500">{change.label}</span>{' '}
                            {change.from === null ? (
                              <span className="text-steel-200">{change.to}</span>
                            ) : (
                              <>
                                <span className="line-through opacity-60">{change.from}</span>{' '}
                                <span className="text-steel-200">→ {change.to}</span>
                              </>
                            )}
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
              {/*
                One costing per line, so this is a list. The sanctioned price sits beside the one
                actually quoted: §8 lets marketing see that figure — it is the price they may
                quote — and the gap between the two is the discount somebody gave, which is
                otherwise invisible on the document.
              */}
              <Fact
                label="Costings behind it"
                value={
                  costed.length ? (
                    <ul className="space-y-1">
                      {costed.map((line) => (
                        <li key={line._id} className="flex items-baseline justify-between gap-3">
                          <Link
                            to={`/pricings/${line.pricing._id}`}
                            className="text-steel-100 hover:text-accent"
                          >
                            {line.modelNumber || line.pricing.number}
                          </Link>
                          <span className="text-xs tabular-nums text-steel-400">
                            {rupees(line.unitPrice)}
                            {line.pricing.approvedSellingPrice &&
                            line.unitPrice < line.pricing.approvedSellingPrice ? (
                              <span className="ml-1 text-warn-400">
                                under {rupees(line.pricing.approvedSellingPrice)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'Quoted from known prices'
                  )
                }
              />
            </dl>

            {/*
              * Under the floor, said without saying where the floor is — the same "whether, not
              * where" §8 draws everywhere else. Someone who may see the figures gets them in the
              * margin table instead, so this is only drawn when they did not.
              */}
            {belowFloor.length > 0 && withMargin.length === 0 && (
              <p className="mt-3 text-xs text-danger-400">
                {belowFloor.length === 1
                  ? `${belowFloor[0].modelNumber || 'One line'} is quoted below its minimum and needs approval.`
                  : `${belowFloor.length} lines are quoted below their minimum and need approval.`}
              </p>
            )}

            {/* Said once for the document, counting the lines rather than naming one price. */}
            {under.length > 0 && (
              <p className="mt-3 text-xs text-warn-400">
                {under.length === 1
                  ? `${under[0].modelNumber || 'One line'} is being quoted under its approved price.`
                  : `${under.length} lines are being quoted under their approved prices.`}
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
