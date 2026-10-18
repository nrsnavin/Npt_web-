/**
 * How an OEE figure reads [server: services/oee.service.js]. World-class moulding runs at about
 * 85%; under 60% means the presses lose more than a third of their time to stops, slow cycles or
 * rejects.
 */
export const OEE_BANDS = [
  { min: 85, tone: 'success', label: 'World class' },
  { min: 60, tone: 'warn', label: 'Typical' },
  { min: 0, tone: 'danger', label: 'Losing time' },
];

export const oeeBand = (value) => (value == null ? null : OEE_BANDS.find((band) => value >= band.min));

export const pctText = (value) => (value == null ? '—' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`);

/** The factor that costs the most — the one to work on first. */
export function weakestFactor(row) {
  const factors = [['availability', 'Availability', 'stops'], ['performance', 'Performance', 'slow cycles'], ['quality', 'Quality', 'rejects']]
    .filter(([key]) => row?.[key] != null);
  if (!factors.length) return null;
  const [key, label, cause] = factors.reduce((low, entry) => (row[entry[0]] < row[low[0]] ? entry : low));
  return { key, label, cause, value: row[key] };
}

/** Each loss as a share of the biggest, for a Pareto bar. */
export const paretoWidths = (rows, field) => {
  const top = Math.max(0, ...rows.map((row) => row[field] || 0));
  return rows.map((row) => ({ ...row, width: top ? Math.round(((row[field] || 0) / top) * 100) : 0 }));
};

/** Coded stop or reject rows that are filled in, numbers as numbers — ready for the server. */
export const codedForSave = (rows, unit) => rows
  .filter((row) => row.reason && row[unit] !== '' && Number(row[unit]) > 0)
  .map((row) => ({ reason: row.reason, [unit]: Number(row[unit]) }));
