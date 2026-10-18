/**
 * Small rules behind the look-ahead screen [pages/ProductionInsights.jsx], kept out of the JSX so
 * they can be tested on their own.
 */

/** The tone a risk level is shown in. */
export const RISK_TONE = { high: 'danger', watch: 'warn', ok: 'success' };

/** "Due now" items first, then by the day to order by; nothing to forecast last. */
export function buyOrder(items = []) {
  return [...items].sort((a, b) => Number(Boolean(b.orderNow)) - Number(Boolean(a.orderNow))
    || String(a.orderBy || '9').localeCompare(String(b.orderBy || '9'))
    || String(a.name || '').localeCompare(String(b.name || '')));
}

/** One line saying what a suggestion buys: late jobs before and after, colour changes, moves. */
export function suggestionHeadline(summary) {
  if (!summary) return '';
  /* Jobs not on a press now are not counted late today, so "late 0 → 3" would read as worse when it is not. */
  const late = summary.unplannedBefore
    ? `${summary.unplannedBefore} not on a press now · ${summary.lateAfter} would still end late`
    : summary.lateBefore === summary.lateAfter
      ? `${summary.lateAfter} late either way`
      : `late jobs ${summary.lateBefore} → ${summary.lateAfter}`;
  const colours = summary.changeoversBefore === summary.changeoversAfter
    ? null
    : `colour changes ${summary.changeoversBefore} → ${summary.changeoversAfter}`;
  const moved = summary.reordered
    ? [summary.newlyPlaced && `${summary.newlyPlaced} put on a press`, summary.moved && `${summary.moved} moved to another press`, `${summary.reordered} changes in all`].filter(Boolean).join(', ')
    : 'nothing to change';
  return [late, colours, moved].filter(Boolean).join(' · ');
}

/** A 'YYYY-MM-DD' day as "24 Oct", without a time-zone shift. */
export function dayText(day) {
  if (!day) return '—';
  const [year, month, date] = String(day).slice(0, 10).split('-').map(Number);
  if (!year || !month || !date) return '—';
  return `${date} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]}`;
}
