const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-IN');

export const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

/** Short currency for dashboard tiles: 12.4L, 1.2Cr. */
export const formatCompactCurrency = (value) => {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  if (Math.abs(amount) >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return currencyFormatter.format(amount);
};

export const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * A count and its noun, agreeing.
 *
 * Written out at every call site until now, which is how "1 task need you" reached a screen
 * somebody reads every morning: the noun was pluralised and the verb was not. Pass the whole
 * phrase — "task needs you" / "tasks need you" — rather than a noun alone, because English
 * disagrees in more places than the ending of one word.
 */
export const plural = (count, one, many) =>
  `${formatNumber(count)} ${Number(count) === 1 ? one : many ?? `${one}s`}`;

/** Turns snake_case enum values into readable labels. */
export const humanise = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
