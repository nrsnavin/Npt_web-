import { PRODUCT_DETAILS, detailsOf, missingDetails, sayList } from '../utils/productDetails.js';

export { PRODUCT_DETAILS, detailsOf, missingDetails, sayList };

/**
 * The product details a quotation or a sales order must not go out without, confirmed where
 * the enquiry did not ask for them.
 *
 * An enquiry asks for the category, hook, clip and packing only on a new development
 * [components/ItemCards.jsx]; a model on the register, or a bought-in piece, arrives on the
 * costing sheet and the order form with those blank. This panel says which are blank, shows
 * what is known, and takes the tick that lets the form save anyway — "confirmed with the
 * buyer" — until the blanks are filled. Filling every one takes the tick away: nothing is left
 * to confirm.
 */

/**
 * The panel. `missingAtOpen` is what the record arrived without (the reason the panel is
 * there); `missingNow` what is still blank after the person's edits — the tick is needed only
 * while something is. `children` are the inputs that fill the blanks, drawn inside the panel.
 */
export default function ProductDetailsConfirm({ line, missingAtOpen, missingNow, confirmed, onConfirm, what = 'quotation', children }) {
  if (!missingAtOpen?.length) return null;
  /* What is known, and the four that matter even when blank — those read "not given". */
  const facts = detailsOf(line).filter(([label, value]) => value || PRODUCT_DETAILS.some((detail) => detail.label === label));
  return (
    <section className="space-y-3 rounded-xl border border-warn-500/40 bg-warn-500/[0.06] p-4" aria-labelledby="product-details-heading">
      <div>
        <p id="product-details-heading" className="text-sm font-bold text-steel-50">Confirm the product details</p>
        <p className="mt-0.5 text-xs text-steel-300">
          {sayList(missingAtOpen)} {missingAtOpen.length === 1 ? 'was' : 'were'} not given on the enquiry. Fill {missingAtOpen.length === 1 ? 'it' : 'them'} in, or confirm the details with the buyer before the {what} goes out.
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
        {facts.map(([label, value]) => {
          const blank = !value && PRODUCT_DETAILS.some((detail) => detail.label === label);
          return (
            <div key={label} className="contents">
              <dt className="text-steel-500">{label}</dt>
              <dd className={blank ? 'font-semibold text-warn-400' : 'text-steel-100'}>{value || (blank ? 'not given' : '—')}</dd>
            </div>
          );
        })}
      </dl>
      {children}
      {missingNow.length > 0 ? (
        <label className="flex items-start gap-2.5 text-sm text-steel-100">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-flame-500"
            checked={Boolean(confirmed)}
            onChange={(event) => onConfirm(event.target.checked)}
            aria-label="Product details confirmed with the buyer"
          />
          <span>
            Product details confirmed with the buyer
            <span className="mt-0.5 block text-xs text-steel-400">{sayList(missingNow)} still blank — tick to go ahead without {missingNow.length === 1 ? 'it' : 'them'}.</span>
          </span>
        </label>
      ) : (
        <p className="text-xs font-semibold text-success-400">Every product detail is filled in.</p>
      )}
    </section>
  );
}
