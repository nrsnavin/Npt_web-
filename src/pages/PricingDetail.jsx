import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Modal, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { MouldThumb } from '../components/MouldPhoto.jsx';
import CostingSheetForm from '../components/CostingSheetForm.jsx';
import CostingDetailsForm from '../components/CostingDetailsForm.jsx';
import PricingDecision from '../components/PricingDecision.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import QuoteFromCosting from '../components/QuoteFromCosting.jsx';
import { StepFooter, StepReview, StepStrip } from '../components/CostingSteps.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import { HANGER_CATEGORIES, HOOK_TYPES, optionLabel } from '../utils/pipeline.js';
/* The tiers and the floor as policy defines them, so the page and the sheet cannot disagree
   about which columns there are — the figures themselves come from the server. */
import { MINIMUM_TIER, STANDARD_TIERS, rupees } from '../utils/pricing.js';

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

const paise = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(3)}`;

/** One line of the per-piece build-up. */
function CostLine({ label, hint, note, value, share, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={`text-sm ${strong ? 'font-bold text-steel-50' : 'text-steel-200'}`}>{label}</p>
        {hint && <p className="text-xs text-steel-500">{hint}</p>}
        {/* Where a figure came from, when it came from somewhere rather than from a keyboard. */}
        {note && <p className="text-xs text-flame-400/80">{note}</p>}
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        {/*
          The share of the total, which is the number that actually starts conversations. A
          costing where the hook is 40% of the piece is a costing worth arguing about, and that
          is invisible when the lines are only rupees.
        */}
        {share !== null && share !== undefined && (
          <span className="w-10 text-right text-xs tabular-nums text-steel-500">
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
  const { canWrite, canQuote } = useAuth();
  const mayCost = canWrite('pricing');
  /* Two different jobs on one record [§8]: building the sheet, and offering what it produced.
     The same person often does both and is not required to. */
  const mayQuote = canQuote('pricing');

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
  const [quoting, setQuoting] = useState(false);
  /*
   * Which model on the sheet is being read.
   *
   * By index rather than by id, because the record is reloaded after every save and an id held
   * across a reload points at a line the new document does not have to contain. The index is
   * clamped below, so a sheet that loses a line falls back to its first rather than to nothing.
   */
  const [active, setActive] = useState(0);

  if (loading) return <Spinner label="Loading the costing" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.data) return null;

  const pricing = data.data;
  const quotations = data.quotations || [];

  /*
   * The sheet holds a line per model [§7], and every figure below belongs to one of them: the
   * cost, the tiers, the floor, the margin, §9's decision. The page reads the chosen line and
   * says which it is — the alternative, adding the lines up, would produce totals that mean
   * nothing: two hangers priced per piece do not have a combined cost per piece.
   */
  const lines = pricing.lines?.length ? pricing.lines : [pricing];
  const line = lines[Math.min(active, lines.length - 1)] || lines[0];
  const several = lines.length > 1;
  /*
   * Where in the sequence we are. `active === lines.length` is the review step — one number
   * rather than an index plus a boolean, so there is no state in which the page believes it is
   * reading a model *and* reviewing.
   */
  const reviewing = several && active >= lines.length;

  /*
   * What can actually go on a quotation.
   *
   * Per line, not off the sheet's roll-up: four models settled and one still waiting used to
   * hide the button entirely, because the sheet read `approval_pending`. The four are offerable
   * and the fifth is simply left off the document until it is signed.
   */
  const approvedLines = lines.filter((row) => row.status === 'approved' && row.approvedSellingPrice);

  /*
   * And of those, the ones not already on an offer the buyer has not answered.
   *
   * The server refuses a second live quotation for a model it has already quoted, so a button
   * offering one is a button that fails. A quote the customer answered is not in the way: they
   * said no to that price, and re-costing and re-quoting is the ordinary next move.
   */
  const settled = ['accepted', 'rejected'];
  const live = quotations.filter((quote) => !settled.includes(quote.status));
  const alreadyOut = new Set(
    live.flatMap((quote) =>
      (quote.lines || [])
        .filter((row) => String(row.pricing?._id ?? row.pricing) === String(pricing._id))
        .map((row) => String(row.pricingLine || lines[0]?._id || ''))
    )
  );
  const quotable = approvedLines.filter((row) => !alreadyOut.has(String(row._id)));

  const cost = line.cost || {};

  const total = line.totalCost || 0;
  const share = (value) => (total ? ((Number(value) || 0) / total) * 100 : 0);

  /* What the buyer wanted against what they will be offered — the gap that decides the job. */
  const target = pricing.enquiry?.targetPrice ?? pricing.targetPrice;
  const asking = line.approvedSellingPrice;
  const gap = target && asking ? ((asking - target) / target) * 100 : null;

  /*
   * Where the gram weight came from, when it came off a tool.
   *
   * Worth a line of its own because the figure on the sheet is deliberately *not* the part
   * weight: a piece off a four-cavity tool with a 12 g runner weighs 30 g and consumes 33.
   * Without this, the first person to compare the two assumes the sheet is wrong and corrects
   * it downwards, which is the error the register exists to prevent.
   */
  const mould = line.mould;
  const fromTool =
    mould && cost.gramWeight
      ? `${mould.mouldCode} — ${mould.partWeightGrams}g part + ${(
          cost.gramWeight - mould.partWeightGrams
        ).toFixed(2)}g runner share, ${mould.runningCavities ?? mould.cavities} up`
      : null;

  /*
   * The resin this line was costed on, by name. The breakdown said "Raw material" and a figure;
   * which resin that figure is — the register entry chosen while costing, and its rate — was
   * only in a side panel, away from the number it explains.
   */
  const partLabel = (label, part) =>
    part?.name ? `${label} — ${part.name}${part.code ? ` (${part.code})` : ''}` : label;

  const resin = line.materialRef
    ? `${line.materialRef.name}${line.materialRef.code ? ` (${line.materialRef.code})` : ''}`
    : line.material?.toUpperCase() || null;

  const costLines = [
    {
      label: resin ? `Raw material — ${resin}` : 'Raw material',
      hint:
        cost.gramWeight && cost.rawMaterialRate
          ? `${cost.gramWeight}g × ₹${cost.rawMaterialRate}/kg ÷ 1000`
          : 'Not entered',
      value: line.materialCost,
      note: fromTool,
    },
    { label: 'Job work', value: cost.jobWorkCost },
    /* Each part named beside its figure, as the resin is — which hook, which clips, which print
       job the sheet was costed with, so the number can be checked against the register. */
    { label: partLabel('Hook', line.hookRef), value: cost.hookCost },
    { label: partLabel('Metal clips', line.clipRef), value: cost.metalClipsCost },
    { label: partLabel('Print price', line.printRef), value: cost.printingCost },
    { label: 'Packing', value: cost.packingCost },
    { label: 'Anything else', value: cost.otherCost },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={pricing.number}
        subtitle={
          <>
            {/* No lot size: the sheet prices one piece, and how many is the purchase order's
                answer. What identifies a costing is the buyer and the model. */}
            {pricing.customer?.name}
            {several
              ? ` · ${lines.length} models`
              : line.modelNumber
                ? ` · ${line.modelNumber}`
                : ''}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {/*
              Quoting, from the sheet that priced it.

              This lived only on the costing list, which meant the one screen showing what a
              price is made of and what has been offered against it was the one screen you
              could not offer from. `canQuote`, not `canWrite`: marketing turns an approved
              price into a document without ever being shown the cost above it.
            */}
            {/*
              Reads the *sheet*, not the line being looked at: quoting takes every approved model
              on it onto one document, which is what a quotation is. A sheet with four approved
              prices and one still waiting offers the four.
            */}
            {mayQuote && quotable.length > 0 && (
              <button type="button" className="btn-primary" onClick={() => setQuoting(true)}>
                {several ? `Quote ${quotable.length} approved` : 'Quote this price'}
              </button>
            )}
            {/*
              Signing it off, on the screen that shows what is being signed.

              This lived only on the costing register, so the one page laying out the cost lines,
              the tiers, the margin and what the buyer asked to pay was the one page without the
              decision they are all for. Whoever opened a sheet to think about it had to go back
              to a table of numbers to say yes.
            */}
            {mayCost && line.status === 'approval_pending' && (
              <button type="button" className="btn-primary" onClick={() => setEditing('decision')}>
                Approve or refuse
              </button>
            )}
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
                {line.status !== 'approval_pending' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditing('sheet')}
                  >
                    {line.status === 'requested' ? 'Build the costing' : 'Re-cost'}
                  </button>
                )}
              </>
            )}
            {/* The sheet's own state, which is a roll-up of the lines — the line being read
                carries its own badge on the switcher below. */}
            <Badge status={pricing.status}>{humanise(pricing.status)}</Badge>
          </div>
        }
      />

      {line.needsApproval && (
        <Notice tone="warn">
          {several ? `${line.modelNumber || 'This model'} is` : 'This price is'} below the approved
          minimum. Nothing can be quoted from it until management signs it off [§9]
          {several ? ' — the other models on this sheet are not held by it' : ''}.
        </Notice>
      )}

      {line.status === 'rejected' && line.rejectionNote && (
        <Notice tone="danger">Refused: {line.rejectionNote}</Notice>
      )}

      {/*
        The models on this sheet, as a sequence.

        Not a table of all of them, because what a costing is *for* is the build-up of one price
        — seven cost lines, three tiers, a floor and a margin — and five of those side by side is
        a spreadsheet nobody can check. So the sheet stays one model at a time, and this says
        which one and how many are left. See `CostingSteps` for why it is ordered steps rather
        than the jump list it was.
      */}
      {several && <StepStrip lines={lines} active={active} onSelect={setActive} />}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/*
            The last step: every price this sheet arrived at, side by side.

            The only place they are seen together — the sheet above is deliberately one model at
            a time — and it is the right place, because what the buyer is sent is one document
            covering all of them.
          */}
          {reviewing && (
            <Section title="Every price on this sheet">
              <StepReview
                lines={lines}
                quotable={quotable}
                alreadyOut={alreadyOut.size > 0}
                mayQuote={mayQuote}
                onQuote={() => setQuoting(true)}
              />
              <div className="mt-4">
                <StepFooter lines={lines} active={active} onSelect={setActive} />
              </div>
            </Section>
          )}

          {/*
            The sheet for one model. Hidden on the review step, which is the same column
            answering a different question — what may go out — rather than a panel beside it.
          */}
          {!reviewing && (
            <>
          {/* ------------------------------ The unit price ------------------------------ */}
          <Section title="What one piece costs">
            {mayCost ? (
              <>
                <div className="divide-y divide-line/[0.04]">
                  {costLines.map((row) => (
                    <CostLine
                      key={row.label}
                      label={row.label}
                      hint={row.hint}
                      note={row.note}
                      value={paise(row.value)}
                      share={share(row.value)}
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
                    {STANDARD_TIERS.map((percent) => {
                      const chosen = (line.markupPercent ?? MINIMUM_TIER) === percent;
                      return (
                        <div
                          key={percent}
                          className={`card px-4 py-3 ${chosen ? 'ring-1 ring-flame-500/50' : ''}`}
                        >
                          <p className="eyebrow">
                            {percent}%{percent === MINIMUM_TIER ? ' · floor' : ''}
                          </p>
                          <p className={`stat-value mt-1 ${chosen ? 'text-flame-400' : 'text-steel-50'}`}>
                            {rupees(line.tiers?.[percent])}
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
                    <p className="mt-0.5 text-xs text-steel-500">
                      {line.effectiveMarkupPercent === null ||
                      line.effectiveMarkupPercent === undefined
                        ? 'What marketing may quote'
                        : `Cost plus ${line.effectiveMarkupPercent}% — what marketing may quote`}
                    </p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Lowest we may sell at</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {rupees(line.minimumSellingPrice)}
                    </p>
                    <p className="mt-0.5 text-xs text-steel-500">
                      {line.minimumOverride == null
                        ? 'The 10% tier, by standing policy'
                        : 'Set for this job'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Margin on the approved price</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {line.grossMarginPercent === null ||
                      line.grossMarginPercent === undefined
                        ? '—'
                        : `${line.grossMarginPercent}%`}
                    </p>
                  </div>
                  <div className="card px-4 py-3">
                    <p className="eyebrow">Margin per piece</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {line.totalCost === undefined || asking === undefined
                        ? '—'
                        : rupees(Math.round((asking - line.totalCost) * 100) / 100)}
                    </p>
                    {/*
                      Per piece, because that is the only figure this sheet has ever computed.
                      The tile here used to multiply by a lot size taken off the enquiry — a
                      number nobody had agreed to — and print it as the value of the job.
                    */}
                    <p className="mt-0.5 text-xs text-steel-500">
                      {rupees(asking)} less {rupees(line.totalCost)} to make
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
                    <p className="eyebrow">What the buyer wanted to pay</p>
                    <p className="stat-value mt-1 text-steel-50">
                      {pricing.targetPrice ? rupees(pricing.targetPrice) : '—'}
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
                  <p className="mt-0.5 text-xs text-steel-500">
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
              <div className="space-y-3">
                <p className="text-sm text-steel-400">
                  Nothing has gone out against this price yet.
                </p>
                {/* The next step, where the absence of it is noticed. An empty panel that only
                    states the emptiness sends the reader back to the list to do the thing. */}
                {mayQuote && quotable.length > 0 && (
                  <button type="button" className="btn-secondary" onClick={() => setQuoting(true)}>
                    {several ? `Quote ${quotable.length} approved` : 'Quote this price'}
                  </button>
                )}
              </div>
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
                          The line off *this model*, not the document total and no longer the
                          sheet's first. A sheet prices several and a quotation can carry eight —
                          matching on the sheet alone put another model's rate beside the one
                          being read, which is a discount that was never given.
                        */}
                        Rev {quote.revision ?? 0} ·{' '}
                        {(() => {
                          const rows = (quote.lines || []).filter(
                            (row) => String(row.pricing) === String(pricing._id)
                          );
                          const quoted =
                            rows.find(
                              (row) => String(row.pricingLine || '') === String(line._id || '')
                            )
                            /* Raised before a quotation line named its costing line, and those
                               sheets priced one model — so the sheet's own row is the answer. */
                            || (several ? undefined : rows[0]);
                          if (!quoted) return 'another model on this sheet';
                          return `${rupees(quoted.unitPrice)}${
                            quoted.moq ? ` · min ${formatNumber(quoted.moq)}` : ''
                          }`;
                        })()}
                        {quote.lines?.length > 1 ? ` · with ${quote.lines.length - 1} other model(s)` : ''}
                        {/* Worth surfacing: a quote below this model's own approved price is a
                            discount somebody gave, and it is invisible on the quotation. */}
                        {asking &&
                        (quote.lines || []).some(
                          (row) =>
                            String(row.pricing) === String(pricing._id)
                            && (!several || String(row.pricingLine || '') === String(line._id || ''))
                            && row.unitPrice < asking
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
                      {/* Editing a quotation is the quotation's own screen — it carries the
                          revision rules, the send gate and the buyer's answer, and none of that
                          belongs in a panel on a costing. What belongs here is the way there. */}
                      <Link to={`/quotations/${quote._id}`} className="row-action">
                        Open
                      </Link>
                      <Badge status={quote.status}>{humanise(quote.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {several && <StepFooter lines={lines} active={active} onSelect={setActive} />}
            </>
          )}

          <QuotationPdf
            quotation={previewing}
            open={Boolean(previewing)}
            onClose={() => setPreviewing(null)}
            /* Sending is done from the document, so this screen's list of what has been quoted
               off this costing is stale the moment it happens. */
            onSent={(sent) => {
              if (sent) setPreviewing(sent);
              reload();
            }}
          />

          <Modal
            open={quoting}
            title={`Quote from ${pricing.number}`}
            description="The price goes on a new quotation, or onto one already being written for this buyer"
            onClose={() => setQuoting(false)}
          >
            <QuoteFromCosting
              pricing={pricing}
              /* What is left to offer — this page already knows what has gone out. */
              lines={quotable}
              onClose={() => setQuoting(false)}
              /*
                Straight into the document, as on the costings screen. The question after
                raising a quote is always "what does that look like", and the answer to it is
                also the place it gets sent from — a draft nobody opened is a draft nobody sent.
                Reloaded rather than patched in: adding a line to a draft changes a quotation
                this screen is already listing, and the server is the only thing that knows
                what it now looks like.
              */
              onQuoted={(quotation) => {
                setPreviewing(quotation);
                reload();
              }}
            />
          </Modal>
        </div>

        {/* --------------------------------- The side --------------------------------- */}
        <div className="space-y-5">
          <Section title="This costing">
            <dl className="space-y-3 text-sm">
              <Fact label="Customer" value={pricing.customer?.name} />
              <Fact label="Model" value={line.modelNumber} />
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
              <Fact label="Material" value={line.materialRef?.name || line.material?.toUpperCase()} />
              <Fact label="Hook" value={line.hookRef?.name} />
              <Fact label="Clip" value={line.clipRef?.name} />
              <Fact
                label="Trade or manufacture"
                value={line.procurement && humanise(line.procurement)}
              />
              <Fact label="Print job" value={line.printRef?.name} />
              <Fact label="Printing" value={line.printing} />
              <Fact label="Asked by" value={pricing.requestedBy?.name} />
              <Fact label="Asked on" value={formatDate(pricing.requestedAt)} />
              <Fact label="Costed by" value={pricing.costedBy?.name} />
              <Fact
                label="Signed off"
                value={
                  line.approvedAt
                    ? `${line.approvedBy?.name || '—'} · ${formatDate(line.approvedAt)}`
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
                <Fact
                  label="Mould"
                  value={(
                    <span className="flex items-center justify-end gap-2.5">
                      <MouldThumb mould={mould} />
                      <span>{mould.mouldCode} — {mould.name}</span>
                    </span>
                  )}
                />
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
          line={line}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      </Modal>

      <Modal
        open={editing === 'decision'}
        title={`Approve ${pricing.number}?`}
        description="This price is below the approved minimum, so nothing can be quoted until it is settled"
        onClose={() => setEditing(null)}
      >
        <PricingDecision
          pricing={pricing}
          line={line}
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
          line={line}
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
