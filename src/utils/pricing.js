/**
 * What a piece is quoted at: cost plus a markup, rounded **up** to five paise [BLUEPRINT §9].
 *
 * A mirror of `pricing.service.js` on the server, and it exists because the costing sheet had
 * its own version that rounded differently. The sheet showed a ₹11.05 cost at 10% as **₹12.16**
 * and the server stored **₹12.20**, because the sheet rounded to the nearest paisa and the
 * server rounds up to the nearest five. Three ways that mattered, in rising order of cost:
 *
 * - Every tier on the sheet read a few paise under the figure that was saved.
 * - The floor hint said "the standing floor, ₹12.16" when the standing floor was ₹12.20.
 * - Clicking a tier filled the approved price with the sheet's number, and a price somebody has
 *   *typed* is deliberately not re-rounded by the server — so the sheet talked the person into
 *   approving a price under the tier they had just pressed, and under the §9 floor, without
 *   either side ever disagreeing out loud.
 *
 * So the rule lives in one module on each side and nowhere else. Duplicated across the wire at
 * all because the sheet recalculates as somebody types and a round trip per keystroke would be
 * worse — but duplicated once, with the server's arithmetic copied exactly rather than
 * re-derived, which is what went wrong the first time.
 */

/**
 * Five paise, the step every figure on the sheet lands on.
 *
 * Not a rupee: a hanger goes out at ₹6-12 in lots of a lakh, so rounding ₹7.05 up to ₹8 adds
 * thirteen percent and loses the job — a bigger move than the whole gap between the 10% and 15%
 * tiers. Five paise is the smallest step that reads as a decided number rather than a computed
 * one. Matches `PRICE_STEP` on the server.
 */
export const PRICE_STEP = 0.05;

/**
 * Money, printed the one way this app prints it.
 *
 * Two decimals rather than the compact form used on dashboards: a hanger's price is a figure
 * somebody reads off the screen and says down a phone to a buyer, and "₹7.2" for ₹7.20 is the
 * kind of rounding that ends up on a purchase order.
 */
export const rupees = (value) =>
  (value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`);

/** The three standing tiers the sheet puts side by side. Matches `STANDARD_TIERS`. */
export const STANDARD_TIERS = [10, 15, 20];

/** The lowest of them, which is also §9's floor. Matches `MINIMUM_TIER`. */
export const MINIMUM_TIER = 10;

/**
 * Cost plus a markup, rounded up to the step.
 *
 * **Up, never to nearest.** The §9 floor is the 10% tier run through this same function, so
 * rounding down would produce a "minimum" a few paise under the true cost-plus-ten — quietly
 * shaving the floor the below-minimum approval exists to defend. Rounding up can only ever be
 * safe, and it costs at most one step less a paisa.
 *
 * **Worked in whole paise** (`× 100`, ceil, `/ 100`), which is not fussiness: in binary floating
 * point `Math.ceil(7.65 / 0.05) * 0.05` gives ₹7.70, because 7.65 / 0.05 is 152.99999999999997
 * and its ceiling is 153. Scaling to integers first leaves a price that is already on the step
 * exactly where it is. Copied from the server rather than rewritten, deliberately — this is the
 * line that has to agree, and an independently sensible version of it is how the two came apart.
 *
 * Cost *plus* a markup, not cost divided by one minus a margin, which is how the plant's sheet
 * works. The two agree at 10% and diverge fast: at 20% they are ₹8.35 and ₹8.70 on the sheet's
 * own first row.
 */
export function priceAt(cost, percent, step = PRICE_STEP) {
  const base = Number(cost) || 0;
  if (!base) return undefined;

  const stepInPaise = Math.round(step * 100);
  const paise = Math.round(base * (1 + (Number(percent) || 0) / 100) * 100);
  return (Math.ceil(paise / stepInPaise) * stepInPaise) / 100;
}

/** The three standing prices for a cost, as `{ 10: 12.2, 15: 12.75, 20: 13.3 }`. */
export const tiersFor = (cost) =>
  Object.fromEntries(STANDARD_TIERS.map((percent) => [percent, priceAt(cost, percent)]));
