import { todayInIndia } from './taskForm.js';

/**
 * The Production desk's queue, in the order the goods are due [pages/DepartmentDashboard.jsx].
 *
 * Production works to the EDD — the expected delivery date on the enquiry [utils/edd.js] — not
 * to the day a task was raised. So the desk is the tasks in EDD order, banded by how close the
 * date is, with the ones nobody has dated last: a task with no EDD is a question before it is
 * work, and the band says so.
 */
export const EDD_BANDS = [
  { key: 'late', label: 'Late — past the EDD', tone: 'text-danger-400' },
  { key: 'today', label: 'Due today', tone: 'text-warn-400' },
  { key: 'week', label: 'This week', tone: 'text-steel-50' },
  { key: 'later', label: 'Later', tone: 'text-steel-50' },
  { key: 'none', label: 'No EDD yet', tone: 'text-warn-400' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (row) => (row?.enquiry?.edd?.date ? String(row.enquiry.edd.date).slice(0, 10) : '');

/** Which band a task falls in, from its enquiry's EDD against India's day. */
export function eddBandOf(row, now = new Date()) {
  const edd = dayOf(row);
  if (!edd) return 'none';
  const today = todayInIndia(now);
  if (edd < today) return 'late';
  if (edd === today) return 'today';
  if (edd <= todayInIndia(new Date(now.getTime() + 7 * DAY_MS))) return 'week';
  return 'later';
}

/** The tasks in EDD order — soonest first, undated last, the due time breaking ties. */
export function byEdd(rows, now = new Date()) {
  const rank = Object.fromEntries(EDD_BANDS.map((band, index) => [band.key, index]));
  return [...rows].sort((a, b) => {
    const bandGap = rank[eddBandOf(a, now)] - rank[eddBandOf(b, now)];
    if (bandGap) return bandGap;
    const dayGap = dayOf(a).localeCompare(dayOf(b));
    if (dayGap) return dayGap;
    return new Date(a.task?.dueDate || 0) - new Date(b.task?.dueDate || 0);
  });
}

/** The queue in its bands, empty bands left out. */
export function eddBands(rows, now = new Date()) {
  const sorted = byEdd(rows, now);
  return EDD_BANDS
    .map((band) => ({ ...band, rows: sorted.filter((row) => eddBandOf(row, now) === band.key) }))
    .filter((band) => band.rows.length);
}

/** The desk's filters: the bands, then the usual two. */
export const PRODUCTION_FILTERS = [
  { key: 'all', label: 'All' },
  ...EDD_BANDS.map((band) => ({ key: band.key, label: band.key === 'late' ? 'Late' : band.label })),
  { key: 'unclaimed', label: 'Not picked up' },
  { key: 'mine', label: 'Mine' },
];
