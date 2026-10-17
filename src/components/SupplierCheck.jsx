import { rupees } from '../utils/pricing.js';
import { supplierCheck } from '../utils/quoteBuilder.js';

/**
 * The making cost of a bought-in piece beside the supplier's inward price [utils/quoteBuilder.js
 * `supplierCheck`]: what the plant would spend to make it from the trading master's grammage,
 * resin, hook, clips and packing, with no margin; what the supplier charges; so the gap is the
 * margin the supplier keeps, and the making cost at 10% and 20% is the figure to negotiate to.
 *
 * Cost, so only where the inward price itself is shown. Nothing here goes on the quotation.
 */
export default function SupplierCheck({ traded, inwardPrice, compact = false, className = '' }) {
  if (!traded?.buildUp) return null;
  const check = supplierCheck(traded, inwardPrice);
  if (!check) {
    return (
      <p className={`text-xs text-steel-500 ${className}`}>
        No making cost yet: give {traded.modelNumber || 'the item'} its grammage, resin, hook and clip costs on the trading master to see what the supplier keeps.
      </p>
    );
  }
  const keeps = check.percent == null ? null : check.percent;
  const tone = keeps == null ? 'text-steel-300' : keeps > 20 ? 'text-danger-400' : keeps > 10 ? 'text-warn-400' : 'text-success-400';
  const breakup = [
    check.known && [`Material ${check.grams} g × ₹${check.ratePerKg}/kg${check.resin ? ` (${check.resin})` : ''}`, check.material],
    check.jobWork > 0 && ['Job work', check.jobWork],
    check.hook > 0 && ['Hook', check.hook],
    check.clips > 0 && ['Clips', check.clips],
    check.packing > 0 && ['Packing', check.packing],
  ].filter(Boolean);

  if (compact) {
    return (
      <p className={`text-xs text-steel-300 ${className}`} data-supplier-check>
        Making cost <span className="font-semibold text-steel-100">{rupees(check.total)}</span> (no margin)
        {check.inward > 0 && (
          <>
            {' '}· supplier keeps <span className={`font-semibold ${tone}`}>{rupees(check.margin)}{keeps != null ? ` (${keeps}%)` : ''}</span>
          </>
        )}
        {' '}· at 10% {rupees(check.at[0][1])} · at 20% {rupees(check.at[1][1])}
        {!check.known && <span className="text-steel-500"> · parts only, no resin named</span>}
      </p>
    );
  }

  return (
    <section className={`rounded-xl border border-aqua-500/25 bg-aqua-500/[0.05] p-4 ${className}`} aria-labelledby="supplier-check-heading" data-supplier-check>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="supplier-check-heading" className="text-sm font-bold text-steel-50">Supplier check — what {traded.modelNumber || 'this piece'} costs to make</p>
        <p className="text-xs text-steel-400">From the trading master’s build-up. Not on the quotation.</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Figure label="Making cost" hint="no margin" value={rupees(check.total)} strong />
        <Figure label="Inward price" hint="supplier charges" value={check.inward > 0 ? rupees(check.inward) : '—'} />
        <Figure label="Supplier keeps" hint={keeps != null ? `${keeps}% on making cost` : 'type the inward price'} value={check.inward > 0 ? rupees(check.margin) : '—'} tone={tone} strong />
        <Figure label="Making + 10%" hint="ask for this" value={rupees(check.at[0][1])} />
        <Figure label="Making + 20%" hint="fair supplier margin" value={rupees(check.at[1][1])} />
      </div>
      {breakup.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel-400">
          {breakup.map(([label, value]) => <li key={label}>{label}: <span className="tabular-nums text-steel-200">{rupees(value)}</span></li>)}
        </ul>
      )}
      {!check.known && (
        <p className="mt-2 text-xs text-warn-400">The resin is not named on the trading master, so the making cost is the parts alone. Pick the material on the item to add the grammage.</p>
      )}
      {check.inward > 0 && keeps != null && (
        <p className="mt-2 text-xs text-steel-300">
          {keeps > 20
            ? `The supplier is keeping ${keeps}% over what it costs to make. Negotiate towards ${rupees(check.at[1][1])} (making + 20%), or ${rupees(check.at[0][1])} at 10%.`
            : keeps > 10
              ? `The supplier is on ${keeps}% — between the 10% and 20% tiers. ${rupees(check.at[0][1])} is the floor to ask for.`
              : keeps >= 0
                ? `The supplier is on ${keeps}% — a tight price; there is little to negotiate below ${rupees(check.at[0][1])}.`
                : 'The inward price is under what it would cost to make — check the build-up before negotiating.'}
        </p>
      )}
    </section>
  );
}

function Figure({ label, hint, value, strong = false, tone = 'text-steel-50' }) {
  return (
    <div className="rounded-lg bg-ink-900/40 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-steel-500">{label}</p>
      <p className={`tabular-nums ${strong ? 'text-lg font-bold' : 'text-base font-semibold'} ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-steel-500">{hint}</p>}
    </div>
  );
}
