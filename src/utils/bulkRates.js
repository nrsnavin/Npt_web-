/**
 * The bulk price update's arithmetic [components/BulkRateForm.jsx]: which typed prices are real
 * changes. A blank box, a price equal to the old one, or something that is not a positive
 * number is not sent — a blank means "leave this one alone".
 */

/** `{ id: typed }` against the rows' old rates → `[{ id, ratePerKg }]` for the ones that moved. */
export function changedRates(rows, typed) {
  return rows
    .map((row) => ({ row, value: String(typed[row._id] ?? '').trim() }))
    .filter(({ value }) => value !== '')
    .map(({ row, value }) => ({ id: row._id, ratePerKg: Number(value), old: Number(row.ratePerKg) }))
    .filter((entry) => Number.isFinite(entry.ratePerKg) && entry.ratePerKg > 0 && entry.ratePerKg !== entry.old)
    .map(({ id, ratePerKg }) => ({ id, ratePerKg }));
}

/** Typed boxes that are filled in but cannot be a price. */
export function invalidRates(typed) {
  return Object.entries(typed)
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .filter(([, value]) => !(Number(value) > 0))
    .map(([id]) => id);
}

/** The move, as a percentage of the old rate: 96 → 101.5 is +5.7%. */
export function moveOf(old, next) {
  const from = Number(old);
  const to = Number(next);
  if (!from || !(to > 0)) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}
