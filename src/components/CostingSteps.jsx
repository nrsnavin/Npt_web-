import { Badge } from './ui.jsx';
import { humanise } from '../utils/format.js';
import { costedWith, rupees } from '../utils/pricing.js';

/**
 * Pricing a sheet of several models, one at a time, ending in what may be offered.
 *
 * **Why a sequence and not a set of tabs.** The chips this replaces were a jump list: five model
 * names, press whichever. That is the right control for coming back to a sheet and checking one
 * figure, and the wrong one for the job that actually takes the time — costing a sheet of five
 * from scratch, where the question is never "which model shall I look at" but "which have I done
 * and which is next". A jump list answers neither, so the person keeps a count in their head and
 * the fifth model is the one that gets missed.
 *
 * So: numbered steps, in order, with the one being worked on lit and the ones behind it carrying
 * their settled price. Moving on is a press rather than a decision. The strip is still a jump
 * list — any step can be pressed directly, because coming back to check one figure is the other
 * real use — it simply also says where you are.
 *
 * **And there is a last step that is not a model.** "Review and quote" holds every price the
 * sheet arrived at, together, which is the first and only place they can be read side by side:
 * the sheet itself is deliberately one model at a time, because seven cost lines, three tiers, a
 * floor and a margin for five models at once is a spreadsheet nobody can check. What a buyer is
 * sent is one document covering all of them, so the moment before sending it is exactly where
 * they should be seen as one list.
 *
 * The button under that list raises a single quotation for every approved, not-yet-offered line
 * — which is what the server does anyway [§7]. A model still waiting on a signature is shown and
 * left off, rather than blocking the other four.
 */

/** The state of one step, in the order the eye needs it: where am I, what is it, is it settled. */
function Step({ index, line, chosen, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={chosen ? 'step' : undefined}
      className={`flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left
        transition-colors ${
        chosen
          ? 'border-flame-500/50 bg-flame-500/[0.08]'
          : 'border-line/[0.08] hover:bg-line/[0.04]'
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
          line.status === 'approved'
            ? 'bg-success-500/15 text-success-400'
            : chosen
              ? 'bg-flame-500/15 text-flame-400'
              : 'bg-line/[0.06] text-steel-400'
        }`}
        aria-hidden
      >
        {line.status === 'approved' ? '✓' : index + 1}
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-sm font-semibold ${
            chosen ? 'text-flame-400' : 'text-steel-200'
          }`}
        >
          {line.modelNumber || `Model ${index + 1}`}
        </span>
        <span className="block text-xs tabular-nums text-steel-500">
          {rupees(line.approvedSellingPrice) || 'Not priced yet'}
        </span>
      </span>
    </button>
  );
}

/**
 * The strip: every model, then the review.
 *
 * `active` is an index into the lines, or `lines.length` for the review step — one number rather
 * than an index plus a boolean, so there is no state in which the page thinks it is on both.
 */
export function StepStrip({ lines, active, onSelect }) {
  const reviewing = active >= lines.length;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {lines.map((line, index) => (
        <Step
          key={line._id || index}
          index={index}
          line={line}
          chosen={!reviewing && index === active}
          onSelect={() => onSelect(index)}
        />
      ))}

      <span className="text-steel-600" aria-hidden>→</span>

      <button
        type="button"
        onClick={() => onSelect(lines.length)}
        aria-current={reviewing ? 'step' : undefined}
        className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
          reviewing
            ? 'border-flame-500/50 bg-flame-500/[0.08] text-flame-400'
            : 'border-line/[0.08] text-steel-300 hover:bg-line/[0.04]'
        }`}
      >
        Review &amp; quote
      </button>
    </div>
  );
}

/** Forward and back, under the sheet — where somebody finishing a model is actually looking. */
export function StepFooter({ lines, active, onSelect }) {
  const last = active >= lines.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/[0.06] pt-4">
      <button
        type="button"
        className="btn-secondary"
        onClick={() => onSelect(active - 1)}
        disabled={active <= 0}
      >
        ◂ Previous
      </button>

      <p className="text-xs text-steel-500">
        {last ? 'Every model on this sheet' : `Model ${active + 1} of ${lines.length}`}
      </p>

      {/* Not drawn on the review step. A disabled "Next model" there is a control that can
          never do anything, and the eye goes to it before it reads why it is grey. */}
      {!last ? (
        <button type="button" className="btn-primary" onClick={() => onSelect(active + 1)}>
          {active === lines.length - 1 ? 'Review & quote ▸' : 'Next model ▸'}
        </button>
      ) : (
        <span className="w-[6.5rem]" aria-hidden />
      )}
    </div>
  );
}

/**
 * The last step: every price the sheet arrived at, and the one press that offers them.
 *
 * A line that is not approved is shown rather than hidden, and says what it is waiting for. The
 * alternative — quietly listing four of five — is how a model gets left off a quotation and
 * nobody notices until the buyer asks about it.
 */
export function StepReview({ lines, quotable, alreadyOut, onQuote, mayQuote }) {
  const offerable = new Set(quotable.map((line) => String(line._id)));

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line/[0.06]">
        {lines.map((line, index) => {
          const approved = line.status === 'approved' && line.approvedSellingPrice;
          const out = approved && !offerable.has(String(line._id));

          return (
            <li
              key={line._id || index}
              className="flex flex-wrap items-baseline justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-steel-100">
                  {line.modelNumber || `Model ${index + 1}`}
                </p>
                {costedWith(line) && (
                  <p className="mt-0.5 text-xs text-steel-400">{costedWith(line)}</p>
                )}
                <p className="mt-0.5 text-xs text-steel-500">
                  {approved
                    ? (out
                      ? 'Already on a quotation the buyer has not answered'
                      : 'Ready to offer')
                    : `Not offerable yet — ${humanise(line.status)}`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`text-sm font-bold tabular-nums ${
                    approved ? 'text-steel-100' : 'text-steel-500'
                  }`}
                >
                  {rupees(line.approvedSellingPrice) || '—'}
                </span>
                <Badge status={line.status}>{humanise(line.status)}</Badge>
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        One press, one document. A sheet of five that has settled four offers those four: the
        fifth is named above with what it is waiting for, and holding the other four back until
        it is signed would be the sheet's roll-up deciding for the buyer.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/[0.06] pt-4">
        <p className="text-xs text-steel-500">
          {quotable.length
            ? `${quotable.length} of ${lines.length} ready to go on a quotation.`
            : (alreadyOut
              ? 'Everything settled here is already on a quotation.'
              : 'Nothing is approved yet — a price has to be signed off before it can be offered.')}
        </p>
        {mayQuote && (
          <button
            type="button"
            className="btn-primary"
            onClick={onQuote}
            disabled={!quotable.length}
          >
            Raise the quotation
          </button>
        )}
      </div>
    </div>
  );
}
