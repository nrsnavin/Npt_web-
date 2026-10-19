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

/* ------------------------------ The queue board's own helpers ------------------------------ */

const dayDiff = (edd, today) => Math.round((Date.parse(`${edd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

/** The EDD in words the floor uses: "3 days late", "today", "tomorrow", "in 4 days", "no EDD". */
export function dueWords(edd, now = new Date()) {
  if (!edd) return 'no EDD';
  const gap = dayDiff(String(edd).slice(0, 10), todayInIndia(now));
  if (gap < 0) return `${-gap} day${gap === -1 ? '' : 's'} late`;
  if (gap === 0) return 'today';
  if (gap === 1) return 'tomorrow';
  return `in ${gap} days`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDay = (day) => {
  const date = new Date(`${day}T00:00:00Z`);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};

/**
 * The queue cut into days, as a shift reads it: everything late first under one heading, then
 * each EDD day with its name, the undated last. Rows must already be in EDD order [byEdd].
 */
export function dayGroups(rows, now = new Date()) {
  const today = todayInIndia(now);
  const groups = [];
  const push = (key, label, tone, row) => {
    const last = groups.at(-1);
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label, tone, rows: [row] });
  };
  for (const row of rows) {
    const edd = dayOf(row);
    if (!edd) push('none', 'No EDD yet — ask for the date', 'text-warn-400', row);
    else if (edd < today) push('late', 'Late — past the EDD', 'text-danger-400', row);
    else {
      const gap = dayDiff(edd, today);
      const name = gap === 0 ? `Today · ${prettyDay(edd)}` : gap === 1 ? `Tomorrow · ${prettyDay(edd)}` : prettyDay(edd);
      push(edd, name, gap === 0 ? 'text-warn-400' : 'text-steel-200', row);
    }
  }
  return groups;
}

/**
 * The board's columns: Production's fifteen statuses folded into the five states a glance needs.
 * A status the server adds later lands in "Planned" rather than off the board.
 */
export const BOARD_COLUMNS = [
  { key: 'new', label: 'New — to accept', statuses: ['received'], tone: 'border-warn-500/40' },
  { key: 'planned', label: 'Planned', statuses: ['accepted', 'planning', 'ready_tomorrow', 'ready_on_date'], tone: 'border-line/[0.12]' },
  { key: 'press', label: 'On the press', statuses: ['started', 'part1_ready', 'part2_ready'], tone: 'border-accent/40' },
  { key: 'problem', label: 'Problems', statuses: ['mould_issue', 'machine_not_allotted', 'raw_material'], tone: 'border-danger-500/40' },
  { key: 'done', label: 'Off the press', statuses: ['completed', 'assembling', 'ready_for_dispatch'], tone: 'border-success-500/40' },
];

export function boardColumnOf(status, issue = false) {
  const found = BOARD_COLUMNS.find((column) => column.statuses.includes(status));
  if (found) return found.key;
  return issue ? 'problem' : 'planned';
}

/** The rows under each column, every column kept so an empty one still reads as empty. */
export const boardOf = (rows) => BOARD_COLUMNS.map((column) => ({
  ...column,
  rows: rows.filter((row) => boardColumnOf(row.task?.status, row.task?.issue) === column.key),
}));

/** The queue as a sheet for the floor: one line per row, the teams beside it. */
export function queueCsv(rows, now = new Date()) {
  const cell = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  /* The queue as the screen reads it: when, whose, the models, and the state in at most thirty words. */
  const lines = [['EDD', 'Due', 'Enquiry', 'Buyer', 'Models', 'SO', 'Status', 'Work orders']];
  for (const row of rows) {
    const edd = row.enquiry?.edd?.date || row.edd?.date || '';
    lines.push([
      edd, dueWords(edd, now), row.enquiry?.number, row.enquiry?.customer?.name,
      (row.models || []).map((entry) => entry.model).join(', ') || row.enquiry?.model, row.order?.number,
      row.summary || row.task?.statusLabel || 'Open',
      (row.workOrders || []).map((wo) => `${wo.number} ${wo.status}`).join('; '),
    ]);
  }
  return `﻿${lines.map((line) => line.map(cell).join(',')).join('\r\n')}\r\n`;
}

/**
 * The press time a row needs, from its mould [server: capacity.service `estimate`]: "2 press days
 * · 12,960 a day", or the plant assumption named as one. Null without a quantity.
 */
export function capacityWords(capacity) {
  if (!capacity?.days) return null;
  const rate = `${Number(capacity.perDay).toLocaleString('en-IN')} a day`;
  return `${capacity.days} press ${capacity.days === 1 ? 'day' : 'days'} · ${capacity.basis === 'mould' ? rate : `${rate} (plant estimate)`}`;
}

/** Whether the press time alone runs past the EDD — started today, it finishes after the promise. */
export function pressTimeTight(row) {
  if (!row?.capacity?.finish || !row?.edd?.date) return false;
  return String(row.capacity.finish).slice(0, 10) > String(row.edd.date).slice(0, 10);
}
