import { formatDate, formatNumber } from '../utils/format.js';

/**
 * How much of each model has gone [server: records.service `modelsSent`] — one bar a model, the
 * track the pieces ordered and the fill the pieces dispatched, with the numbers beside it in
 * plain words. Hover (or focus) a bar for its loads, day by day. One series, one hue: the model
 * name and the words carry the meaning, never the colour alone. The loads listed under each
 * dispatch request are the same numbers as a table.
 */
export default function DispatchProgress({ models = [] }) {
  if (!models.length || !models.some((row) => row.sent > 0 || row.ordered > 0)) return null;
  const ordered = models.reduce((sum, row) => sum + (row.ordered || 0), 0);
  const sent = models.reduce((sum, row) => sum + (row.sent || 0), 0);
  const loads = new Set(models.flatMap((row) => (row.loads || []).map((load) => String(load.at)))).size;
  return (
    <div className="space-y-3" aria-label="Pieces dispatched by model">
      {/* The headline: everything together. */}
      <p className="text-sm text-steel-300">
        <span className="text-xl font-bold tabular-nums text-steel-50">{formatNumber(sent)}</span>
        {ordered > 0 && <span className="tabular-nums"> of {formatNumber(ordered)} pcs</span>} dispatched
        {loads > 0 && <span className="text-steel-500"> · {loads} load{loads === 1 ? '' : 's'}</span>}
      </p>
      <ul className="space-y-3">
        {models.map((row) => {
          const share = row.ordered > 0 ? Math.min(1, row.sent / row.ordered) : row.sent > 0 ? 1 : 0;
          const words = row.ordered > 0
            ? `${formatNumber(row.sent)} of ${formatNumber(row.ordered)} pcs`
            : row.sent > 0 ? `${formatNumber(row.sent)} pcs` : 'Quantity not on the order';
          const state = row.ordered > 0
            ? (row.left > 0 ? (row.sent > 0 ? `${formatNumber(row.left)} to go` : 'Not sent yet') : 'All sent')
            : (row.sent > 0 ? 'Sent' : 'Not sent yet');
          return (
            <li key={row.model} className="group relative">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold text-steel-100">{row.model}</span>
                <span className="tabular-nums text-steel-300">
                  {words} · <span className={row.left > 0 || !row.sent ? 'text-steel-400' : 'font-semibold text-steel-100'}>{state}</span>
                </span>
              </div>
              {/* The bar: focusable, so the loads show for a keyboard as well as a pointer. */}
              <div
                tabIndex={0}
                role="img"
                aria-label={`${row.model}: ${words} dispatched, ${state}`}
                className="mt-1.5 h-3 w-full rounded-[4px] bg-line/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <div className="h-3 rounded-[4px] bg-accent transition-[width]" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              {(row.loads || []).length > 0 && (
                <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden min-w-[12rem] rounded-lg border border-line/[0.1] bg-ink-850 px-3 py-2 text-xs shadow-modal group-hover:block group-focus-within:block">
                  <p className="mb-1 font-semibold text-steel-100">{row.model} — loads</p>
                  {row.loads.map((load, index) => (
                    <p key={`${load.at}-${index}`} className="flex justify-between gap-4 tabular-nums text-steel-300">
                      <span>{formatDate(load.at)}</span>
                      <span>{formatNumber(load.quantity)} pcs</span>
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
