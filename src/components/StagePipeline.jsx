import { formatCompactCurrency, formatNumber } from '../utils/format.js';
import { LEAD_STAGES } from '../utils/pipeline.js';

/**
 * The stages, as a pipeline rather than five buttons.
 *
 * They used to be five identical cards, each reading "Show" — a row of chrome where the shape
 * of somebody's week should be. Nothing on them was information: not the count, not the money,
 * not whether the book was healthy. You could not tell by looking whether there were forty
 * leads at Contacted or none, which is the first thing anybody wants to know on this screen and
 * the reason they scroll straight past a row of tiles to the table.
 *
 * So each one now carries what it is worth pressing for.
 *
 * **The count, and the money behind it.** Two figures a manager actually uses: how many, and
 * what they add up to. The value is the estimate people typed, so it is shown as an estimate
 * and never totalled into a headline that would look like revenue.
 *
 * **A bar, scaled across the row.** Every stage's bar is drawn against the largest stage, so
 * the row reads as one shape at a glance — where the book is bunched, and where it thins out.
 * Scaled per-card they would all be full and say nothing.
 *
 * **Stage order, always.** Left to right is the order a lead actually moves, so the row is a
 * funnel and the step where it collapses is visible. Sorting these by size would be a bar chart
 * that had thrown away the one thing it was drawing.
 *
 * **Colour only where it is an outcome.** Won is green and lost is grey because those are
 * states the reader already knows the meaning of. The three working stages are magnitude, not
 * identity, and giving each its own hue would say they are things to be told apart rather than
 * counted against each other.
 */

/**
 * Tones by what the stage *means*, across both vocabularies.
 *
 * A lead is converted or disqualified and an enquiry is won or lost, and those are the same two
 * ideas wearing different words. Keyed on meaning rather than on which list it came from, so
 * the two screens cannot drift into disagreeing about what green is.
 */
const WON = ['converted', 'won'];
const LOST = ['disqualified', 'lost'];
const PARKED = ['hold'];

const DECIDED = [...WON, ...LOST];

const TONES = {
  working: {
    bar: 'bg-flame-500',
    ring: '!border-flame-500/50',
    wash: 'bg-flame-500/[0.07]',
    text: 'text-flame-400',
  },
  won: {
    bar: 'bg-success-500',
    ring: '!border-success-500/50',
    wash: 'bg-success-500/[0.07]',
    text: 'text-success-400',
  },
  lost: {
    bar: 'bg-steel-500',
    ring: '!border-steel-500/50',
    wash: 'bg-steel-500/[0.07]',
    text: 'text-steel-400',
  },
  /* Parked is not lost and not being worked, and should read as neither. */
  parked: {
    bar: 'bg-warn-500',
    ring: '!border-warn-500/50',
    wash: 'bg-warn-500/[0.07]',
    text: 'text-warn-400',
  },
};

const toneFor = (value) => {
  if (WON.includes(value)) return TONES.won;
  if (LOST.includes(value)) return TONES.lost;
  if (PARKED.includes(value)) return TONES.parked;
  return TONES.working;
};

/**
 * `stages` because this serves two lists now.
 *
 * Leads have five stages and every one is worth a card. Enquiries have twelve, and twelve cards
 * is a wall rather than a strip — so with `dense` an enquiry stage nothing sits in is left out,
 * and comes back the moment something reaches it. The stage currently filtered on always stays,
 * or choosing an empty one would remove the control that undoes the choice.
 */
export default function StagePipeline({
  stages = LEAD_STAGES,
  counts = {},
  selected,
  onSelect,
  loading = false,
  dense = false,
}) {
  /*
   * `amount`, not `value`. A stage already has a `value` — its identifier — and calling the
   * money by the same name spread over the top of it: the key became a rupee total, several
   * stages keyed on 0, and pressing Qualified filtered by Disqualified. Renaming the money is
   * the fix; the two things are not the same thing and should never have shared a word.
   */
  const all = stages.map((stage) => ({
    ...stage,
    leads: counts[stage.value]?.leads || 0,
    amount: counts[stage.value]?.value || 0,
    tone: toneFor(stage.value),
  }));

  const rows = dense ? all.filter((row) => row.leads || row.value === selected) : all;
  if (!rows.length) return null;

  // Scaled across the row, not within each card — the comparison is between stages.
  const largest = Math.max(...rows.map((row) => row.leads), 1);
  const total = rows.reduce((sum, row) => sum + row.leads, 0);

  return (
    <div
      role="tablist"
      aria-label="Filter by stage"
      className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      {rows.map((row) => {
        const chosen = selected === row.value;
        const share = total ? Math.round((row.leads / total) * 100) : 0;

        return (
          <button
            key={row.value}
            type="button"
            role="tab"
            aria-selected={chosen}
            /*
             * The count is in the label rather than left to the eye, because a screen reader
             * gets none of the bar and none of the colour — without it this is five buttons
             * called New, Contacted, Qualified again.
             */
            aria-label={`${row.label}: ${row.leads} leads${chosen ? ', filtering' : ''}`}
            onClick={() => onSelect(row.value)}
            className={`card-interactive group relative overflow-hidden px-3.5 py-3 text-left transition-transform duration-150 hover:-translate-y-0.5 ${
              chosen ? `${row.tone.ring} ${row.tone.wash}` : ''
            } ${DECIDED.includes(row.value) ? 'lg:mt-0' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                {row.label}
              </p>
              {chosen && (
                <span className={`text-[0.625rem] font-bold uppercase tracking-wide ${row.tone.text}`}>
                  Filtering
                </span>
              )}
            </div>

            <div className="mt-1.5 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold leading-none tabular-nums tracking-tight ${
                  row.leads ? 'text-steel-50' : 'text-steel-600'
                }`}
              >
                {loading ? '—' : formatNumber(row.leads)}
              </span>
              {/* The share is context beside the count, never instead of it. */}
              {Boolean(row.leads) && (
                <span className="text-[0.6875rem] tabular-nums text-steel-500">{share}%</span>
              )}
            </div>

            {/* An estimate, and labelled as one — never a total that could read as revenue. */}
            <p className="mt-1 h-4 text-[0.6875rem] tabular-nums text-steel-500">
              {row.amount ? `~${formatCompactCurrency(row.amount)} estimated` : ''}
            </p>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/[0.06]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${row.tone.bar}`}
                style={{ width: `${row.leads ? Math.max((row.leads / largest) * 100, 4) : 0}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
