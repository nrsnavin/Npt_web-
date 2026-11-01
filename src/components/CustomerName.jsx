/**
 * A customer's name, wherever it is read: in the fluorescent tone, so the buyer stands out of
 * every row, card, title and notice at a glance [theme.css `--customer-name`]. The fallback — "No
 * customer", a dash — reads in the ordinary tone, because it is not a name.
 */
export default function CustomerName({ name, fallback = '—', className = '' }) {
  if (!name) return fallback ?? null;
  return <span className={`customer-name ${className}`.trim()}>{name}</span>;
}
