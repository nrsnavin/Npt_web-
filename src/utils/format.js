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

/**
 * A day as a date input wants it — "2026-10-12" — on the calendar of whoever is looking.
 *
 * Not the ISO string cut to ten characters: that is the day in Greenwich, which in India is yesterday until
 * 05:30. Defaults built that way offered yesterday as "today", and the server refused them as past.
 */
export const isoDay = (value = new Date()) => {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/** "12 Oct 2026, 2:19 pm" — for a line in a history, where the order within a day matters. */
export const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(/\s?(am|pm)$/i, (match) => match.toLowerCase());
};

/**
 * How long ago, as a person says it — "just now", "25 min ago", "3 h ago", "yesterday",
 * "4 days ago" — and the date itself once it is more than a week old. For a line in a
 * history that is read the same day it was written; the exact time goes on hover.
 */
export const formatRelative = (value, now = Date.now()) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24 && isoDay(then) === isoDay(now)) return `${hours} h ago`;
  const days = Math.round((new Date(isoDay(now)) - new Date(isoDay(then))) / 86400000);
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
};

/** Two letters for a marker: "Ramesh Plant" → "RP", "Nandhini" → "N". */
export const initialsOf = (name = '') =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || '?';

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
