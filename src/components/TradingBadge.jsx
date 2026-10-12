/**
 * "Trading model" — a priced line for a piece bought in and resold rather than made here
 * [server: Quotation line `procurement: 'trade'`, `tradedItem`]. Costed at the supplier's inward
 * price, not off a mould, so it is said wherever the line is read.
 */
export const isTradingLine = (line) => line?.procurement === 'trade' || Boolean(line?.tradedItem);

export default function TradingBadge({ line, className = '' }) {
  if (line && !isTradingLine(line)) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-aqua-500/15 px-2 py-0.5 text-xs font-semibold text-aqua-600 ${className}`}
      title="Bought in and resold — costed at the supplier's inward price"
    >
      Trading model
    </span>
  );
}
