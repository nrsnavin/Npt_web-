import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Modal, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import OrderFromQuotation from '../components/OrderFromQuotation.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import CostingSheetForm from '../components/CostingSheetForm.jsx';
import PricingDecision from '../components/PricingDecision.jsx';
import { MouldThumb } from '../components/MouldPhoto.jsx';
import { QuotationForm, ResponseForm, RevisionForm } from './Quotations.jsx';
import { formatDate, formatNumber, humanise } from '../utils/format.js';
import { costedWith } from '../utils/pricing.js';

/**
 * One quotation, in full — its costing and its offer on one record [BLUEPRINT §7–§10].
 *
 * The Quotation department costs each line here, Admin signs off a price under its minimum
 * here, and marketing or the Quotation department sends it from here. Cost columns appear only
 * when the server sent them [§8] — the screen never decides that for itself.
 *
 * The revision history is the point of this page, not a footnote on it. §10's whole demand is
 * that every revision stays — Rev 0 ₹7.50, Rev 1 ₹7.30, Rev 2 ₹7.20 — and a list of prices with
 * no sense of movement answers "what did we quote" while leaving the question people actually
 * ask unanswered: *how did we get here, and how much have we already given away?* So each
 * revision is shown against the one before it, with what changed and by how much.
 *
 * The rest of the page is what a person needs to read that history honestly: the live offer,
 * the terms it carries, and the enquiry it answers.
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

/** Where the quotation is, as five steps a person can read at a glance. */
const STEPS = [
  { key: 'costing', label: 'Costing' },
  { key: 'approval_pending', label: 'Admin approval' },
  { key: 'draft', label: 'Ready to send' },
  { key: 'sent', label: 'With the buyer' },
  { key: 'answered', label: 'Answered' },
];

const stepOf = (quotation) => {
  if (['accepted', 'rejected'].includes(quotation.status)) return 'answered';
  if (quotation.status === 'revised') return 'draft';
  if (quotation.status === 'approved') return 'draft';
  return quotation.status;
};

function Progress({ quotation }) {
  const at = STEPS.findIndex((step) => step.key === stepOf(quotation));
  return (
    <ol className="mb-5 grid grid-cols-5 gap-1.5" aria-label="Where this quotation is">
      {STEPS.map((step, index) => {
        const done = index < at;
        const current = index === at;
        return (
          <li key={step.key} className="min-w-0">
            <div className={`h-1.5 rounded-full ${done ? 'bg-flame-500' : current ? 'bg-flame-400' : 'bg-line/[0.08]'}`} />
            <p className={`mt-1.5 truncate text-[0.7rem] font-semibold uppercase tracking-wide ${current ? 'text-steel-50' : done ? 'text-steel-300' : 'text-steel-500'}`}>
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** One line's state, in words. */
const LINE_STATE = {
  requested: { label: 'Needs costing', tone: 'text-warn-400' },
  costed: { label: 'Costed', tone: 'text-steel-300' },
  approval_pending: { label: 'Waiting on Admin', tone: 'text-warn-400' },
  approved: { label: 'Cleared', tone: 'text-success-400' },
  rejected: { label: 'Price refused', tone: 'text-danger-400' },
};

export default function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite, canQuote, mayDelete } = useAuth();
  const fetch = useCallback((quotationId) => quotationsApi.get(quotationId), []);
  const { data: quotation, loading, error, reload } = useRecord(fetch, id);
  const [showingPdf, setShowingPdf] = useState(false);
  const [composing, setComposing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [costing, setCosting] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [editing, setEditing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [answering, setAnswering] = useState(false);

  if (loading) return <Spinner label="Loading the quotation" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!quotation) return null;

  const lines = quotation.lines || [];
  const closed = ['accepted', 'rejected'].includes(quotation.status);
  const mayQuote = canQuote('pricing');
  /* The server sends the cost only to whoever may see it [§8]; its absence is the answer. */
  const seesCost = !quotation.costingHidden;
  /* Admin — the role or the Admin department — signs a price off below its minimum. */
  const maySign = mayDelete;
  const sendable = ['draft', 'revised'].includes(quotation.status);

  const revisions = [...(quotation.revisions || [])].reverse();
  const first = quotation.revisions?.[0];
  const rateOf = (rows, model) => (rows || []).find((line) => (line.modelNumber || line._id) === model)?.unitPrice;
  const shared = (first?.lines || [])
    .map((line) => line.modelNumber || line._id)
    .filter((model) => rateOf(quotation.lines, model) !== undefined && rateOf(first.lines, model) !== undefined);
  const openingRate = shared.reduce((sum, m) => sum + rateOf(first.lines, m), 0);
  const currentRate = shared.reduce((sum, m) => sum + rateOf(quotation.lines, m), 0);
  const given = openingRate ? ((currentRate - openingRate) / openingRate) * 100 : null;

  const unpriced = lines.filter((line) => line.status === 'requested' || line.unitPrice == null);
  const waiting = lines.filter((line) => line.status === 'approval_pending');
  const refused = lines.filter((line) => line.status === 'rejected');
  const names = (rows) => rows.map((line) => line.modelNumber || 'a model').join(', ');

  const sole = lines.length === 1 ? lines[0] : null;
  const done = () => {
    setEditing(false);
    setRevising(false);
    setAnswering(false);
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={quotation.number}
        subtitle={
          <>
            {quotation.customer?.name} ·{' '}
            {sole
              ? `${sole.modelNumber || 'one model'}${sole.moq ? ` · min ${formatNumber(sole.moq)} pcs` : ''}`
              : `${lines.length} models`}{' '}
            · Rev {quotation.revision ?? 0}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={quotation.status}>{humanise(quotation.status === 'draft' ? 'ready_to_send' : quotation.status)}</Badge>
            <button type="button" className="btn-secondary" onClick={() => { setComposing(false); setShowingPdf(true); }}>
              Document
            </button>
            {mayQuote && !closed && !quotation.sentAt && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
            )}
            {mayQuote && !closed && quotation.sentAt && (
              <button type="button" className="btn-secondary" onClick={() => setRevising(true)}>Revise</button>
            )}
            {mayQuote && quotation.status === 'sent' && (
              <button type="button" className="btn-secondary" onClick={() => setAnswering(true)}>Record the answer</button>
            )}
            {mayQuote && sendable && (
              <button type="button" className="btn-primary" onClick={() => { setComposing(true); setShowingPdf(true); }}>
                Send to the buyer
              </button>
            )}
            {quotation.status === 'accepted' && canWrite('orders') && (
              <button type="button" className="btn-primary" onClick={() => setOrdering(true)}>Book the order</button>
            )}
          </div>
        }
      />

      <Progress quotation={quotation} />

      <div className="mb-5 space-y-2">
        {quotation.status === 'costing' && unpriced.length > 0 && (
          <Notice tone="info">
            {names(unpriced)} {unpriced.length === 1 ? 'is' : 'are'} with the Quotation department to cost.
            {seesCost ? ' Press Cost on the line to price it.' : ' You will be told when it is ready to send.'}
          </Notice>
        )}
        {waiting.length > 0 && (
          <Notice tone="warn">
            {names(waiting)} {waiting.length === 1 ? 'is' : 'are'} priced below the minimum and
            {waiting.length === 1 ? ' waits' : ' wait'} on Admin before this can be sent [§9].
          </Notice>
        )}
        {refused.length > 0 && (
          <Notice tone="danger">
            Admin refused the price on {names(refused)}. Change it and it goes back for approval.
          </Notice>
        )}
        {quotation.isExpired && (
          <Notice tone="warn">
            The validity passed on {formatDate(quotation.validUntil)}. Revise it before the buyer can act on it.
          </Notice>
        )}
        {quotation.status === 'rejected' && quotation.rejectionNote && (
          <Notice tone="danger">The customer turned it down: {quotation.rejectionNote}</Notice>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          <Section title={`Models and prices (${lines.length})`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-right">Minimum</th>
                    <th className="px-3 py-2 text-right">Price / pc</th>
                    {seesCost && <th className="px-3 py-2 text-right">Cost</th>}
                    {seesCost && <th className="px-3 py-2 text-right">Margin</th>}
                    <th className="px-3 py-2 text-left">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {lines.map((line) => {
                    const state = LINE_STATE[line.status] || LINE_STATE.requested;
                    return (
                      <tr key={line._id}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <MouldThumb mould={line.mould} />
                            <div className="min-w-0">
                              <p className="font-semibold text-steel-100">{line.modelNumber || '—'}</p>
                              <p className="text-xs text-steel-500">
                                {[costedWith(line), line.colour].filter(Boolean).join(' · ') || line.mould?.name || ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                          {line.moq ? `${formatNumber(line.moq)} pcs` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-steel-50">
                          {line.unitPrice != null ? rupees(line.unitPrice) : <span className="font-normal text-steel-500">Not priced</span>}
                        </td>
                        {seesCost && (
                          <td className="px-3 py-3 text-right tabular-nums text-steel-300">
                            {line.totalCost ? rupees(line.totalCost) : '—'}
                            {line.minimumSellingPrice != null && (
                              <p className="text-xs text-steel-500">min {rupees(line.minimumSellingPrice)}</p>
                            )}
                          </td>
                        )}
                        {seesCost && (
                          <td className={`px-3 py-3 text-right tabular-nums ${line.belowMinimum ? 'text-danger-400' : 'text-steel-200'}`}>
                            {line.grossMarginPercent != null ? `${line.grossMarginPercent}%` : '—'}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold ${state.tone}`}>{state.label}</span>
                          {line.status === 'approved' && line.approvedBy?.name && (
                            <p className="text-xs text-steel-500">signed by {line.approvedBy.name}</p>
                          )}
                          {line.status === 'rejected' && line.rejectionNote && (
                            <p className="text-xs text-steel-500">{line.rejectionNote}</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {seesCost && !closed && (
                              <button type="button" className={`${line.status === 'requested' ? 'btn-primary' : 'btn-secondary'} px-2.5 py-1 text-xs`} onClick={() => setCosting(line)}>
                                {line.status === 'requested' ? 'Cost it' : 'Cost'}
                              </button>
                            )}
                            {maySign && line.status === 'approval_pending' && (
                              <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => setDeciding(line)}>
                                Approve / refuse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line/[0.06] pt-4 text-sm sm:grid-cols-2">
              <Fact label="Basis" value={quotation.isExport ? 'Export — no GST' : quotation.gstPercent ? `+${quotation.gstPercent}% GST` : 'GST extra'} />
              <Fact label="Valid until" value={quotation.validUntil && formatDate(quotation.validUntil)} />
              <Fact label="Payment terms" value={quotation.paymentTerms} />
              <Fact label="Delivery" value={quotation.deliveryTerms} />
              <Fact label="Freight" value={FREIGHT_LABELS[quotation.freightTerms] || quotation.freightTerms} />
              <Fact label="Packing" value={quotation.packing} />
              <Fact label="Remarks" value={quotation.remarks} />
            </dl>
          </Section>

          <Section title={`What has been offered (${revisions.length})`}>
            {given !== null && revisions.length > 1 && (
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-line/[0.08] bg-line/[0.02] px-4 py-3">
                <span className="text-xs uppercase tracking-wide text-steel-500">Since Rev 0</span>
                <span className={`text-lg font-bold tabular-nums ${given < 0 ? 'text-warn-400' : given > 0 ? 'text-success-400' : 'text-steel-100'}`}>
                  {given > 0 ? '+' : ''}{given.toFixed(1)}%
                </span>
                <span className="text-xs text-steel-400">
                  across {shared.length === 1 ? 'the rate' : `${shared.length} rates`} quoted in both revisions
                </span>
              </div>
            )}
            <ol className="space-y-3">
              {revisions.map((revision, index) => {
                const previous = revisions[index + 1];
                const changes = changesBetween(revision, previous);
                const live = revision.revision === quotation.revision;
                const rates = (revision.lines || []).map((line) => line.unitPrice).filter((price) => price != null);
                const low = rates.length ? Math.min(...rates) : null;
                const high = rates.length ? Math.max(...rates) : null;
                return (
                  <li key={revision.revision} className={`rounded-lg border px-3.5 py-3 ${live ? 'border-flame-500/40 bg-flame-500/[0.04]' : 'border-line/[0.06]'}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-3">
                        <span className="text-sm font-bold text-steel-100">Rev {revision.revision}</span>
                        <span className="text-base font-bold tabular-nums text-steel-50">
                          {low === null ? 'Not priced yet' : low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`}
                        </span>
                        <span className="text-xs text-steel-400">
                          {revision.lines?.length === 1 ? 'per piece' : `${revision.lines?.length ?? 0} models`}
                        </span>
                        {live && <span className="text-[0.75rem] font-bold uppercase tracking-wide text-flame-400">Live</span>}
                      </div>
                      <span className="text-xs text-steel-500">
                        {revision.by?.name ? `${revision.by.name} · ` : ''}
                        {formatDate(revision.at)}
                        {revision.sentAt ? ` · sent ${formatDate(revision.sentAt)}` : ''}
                      </span>
                    </div>
                    {changes.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="This quotation">
            <dl className="space-y-3 text-sm">
              <Fact label="Customer" value={quotation.customer?.name} />
              <Fact label="Enquiry" value={quotation.enquiry && (
                <Link to={`/enquiries/${quotation.enquiry._id}`} className="text-steel-100 hover:text-accent">{quotation.enquiry.number}</Link>
              )} />
              <Fact label="Owner" value={quotation.assignedTo?.name} />
              <Fact label="Buyer wants to pay" value={quotation.targetPrice && rupees(quotation.targetPrice)} />
              <Fact label="Asked for by" value={quotation.requestedBy?.name} />
              <Fact label="Costed by" value={quotation.costedBy?.name} />
              <Fact label="Raised" value={formatDate(quotation.createdAt)} />
              <Fact label="Sent" value={quotation.sentAt && formatDate(quotation.sentAt)} />
              <Fact label="Answered" value={quotation.respondedAt && formatDate(quotation.respondedAt)} />
            </dl>
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
                      {entry.note && <p className="mt-0.5 text-xs text-steel-400">{entry.note}</p>}
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

      <Modal open={Boolean(costing)} title={`Cost ${costing?.modelNumber || 'this model'}`} description="The registers fill the costing; a typed figure wins" size="lg" onClose={() => setCosting(null)}>
        {costing && <CostingSheetForm quotation={quotation} line={costing} onClose={() => setCosting(null)} onSaved={() => { setCosting(null); reload(); }} />}
      </Modal>

      <Modal open={Boolean(deciding)} title={`Price on ${deciding?.modelNumber || 'this model'}`} description="Below its minimum — your signature lets it go out" onClose={() => setDeciding(null)}>
        {deciding && <PricingDecision quotation={quotation} line={deciding} onClose={() => setDeciding(null)} onSaved={() => { setDeciding(null); reload(); }} />}
      </Modal>

      <Modal open={editing} title={`Edit ${quotation.number}`} description="Free until it goes out; after that, changes are revisions" size="lg" onClose={() => setEditing(false)}>
        {editing && <QuotationForm quotation={quotation} onClose={() => setEditing(false)} onSaved={done} />}
      </Modal>

      <Modal open={revising} title={`Revise ${quotation.number}`} description="The price it carried before stays in the history" onClose={() => setRevising(false)}>
        {revising && <RevisionForm quotation={quotation} onClose={() => setRevising(false)} onSaved={done} />}
      </Modal>

      <Modal open={answering} title={`What did they say about ${quotation.number}?`} description="Accepting it moves the enquiry to PO expected" onClose={() => setAnswering(false)}>
        {answering && <ResponseForm quotation={quotation} onClose={() => setAnswering(false)} onSaved={done} />}
      </Modal>

      <Modal open={ordering} title="Book the order" description={`The purchase order against ${quotation.number}`} size="lg" onClose={() => setOrdering(false)}>
        <OrderFromQuotation quotation={quotation} onClose={() => setOrdering(false)} onOrdered={(order) => navigate(`/orders/${order._id}`)} />
      </Modal>

      <QuotationPdf
        quotation={quotation}
        open={showingPdf}
        compose={composing}
        onClose={() => setShowingPdf(false)}
        onSent={() => reload()}
      />
    </div>
  );
}
