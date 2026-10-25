/**
 * The department task form, as plain functions [components/DepartmentTaskDialog.jsx; server:
 * config/departmentTaskForms.js, handoff.service `taskPrefill`].
 *
 * The server says what each department's form asks and where each answer is filled from; these
 * turn that, and the enquiry's prefill, into the form's starting answers — and back into what
 * is sent. Kept out of the component so they can be tested without a browser.
 */
import { formatDate } from './format.js';

/** A value from the prefill by its path: "customer.contactPerson", "models", "items". */
export function prefillValue(prefill, path) {
  if (!prefill || !path) return undefined;
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), prefill);
}

/** One cell of a row as it reads on the task: 5,000 pcs · ₹2.4 / pc · EDD 2026-11-10. */
export const cellText = (column, value) => (column.key === 'quantity' ? `${value} pcs`
  : column.key === 'price' ? `₹${value} / pc`
    : column.key === 'targetPrice' ? `target ₹${value} / pc`
    : column.type === 'date' ? `${column.label || column.key} ${value}`
      : value);

const blankRow = (columns) => Object.fromEntries(columns.map((column) => [column.key, '']));

/** A starting answer for one question: from the enquiry when it knows, else empty. */
function startingAnswer(field, prefill) {
  const known = prefillValue(prefill, field.from);
  if (field.type === 'items') {
    const rows = Array.isArray(known) && known.length ? known : [{}];
    return rows.map((row) => ({ ...blankRow(field.columns), ...pick(row, field.columns) }));
  }
  /* A box the form starts ticked (`checked`: the SO request's Production confirmed) unless the enquiry says otherwise. */
  if (field.type === 'check') return known == null ? Boolean(field.checked) : Boolean(known);
  if (field.type === 'choice' && field.options && !field.options.includes(known)) return '';
  return known == null ? '' : String(known);
}

const pick = (row, columns) => Object.fromEntries(columns
  .filter((column) => row?.[column.key] != null)
  .map((column) => {
    const value = String(row[column.key]);
    return [column.key, column.type === 'choice' && column.options && !column.options.includes(value) ? '' : value];
  }));

/** Every answer a form starts with. `kind` and `info` questions are not answers. */
export function startingAnswers(button, prefill) {
  return Object.fromEntries((button?.asks || [])
    .filter((field) => field.type !== 'kind' && field.type !== 'info')
    .map((field) => [field.key, startingAnswer(field, prefill)]));
}

/** The choices of a question whose options come from the enquiry (its own models). */
export const optionsOf = (field, prefill) => (field.optionsFrom ? prefillValue(prefill, field.optionsFrom) || [] : field.options || []);

/**
 * The Workflow / Department list: one entry per department task, named by its team; two buttons
 * that are one form (My / Team Payment Follow-up) are one entry, and the owner picks between them.
 */
export function departmentOptions(buttons = []) {
  const tasks = buttons.filter((button) => button.department && !button.hidden && button.form);
  const byTeam = tasks.reduce((counts, button) => ({ ...counts, [button.form.team]: (counts[button.form.team] || 0) + 1 }), {});
  const seen = new Set();
  return tasks
    .map((button) => ({ value: button.form.option || button.key, button }))
    .filter(({ value }) => (seen.has(value) ? false : seen.add(value)))
    .map(({ value, button }) => {
      const shared = byTeam[button.form.team] > 1 && !button.form.option;
      return { value, label: shared ? `${button.form.team} — ${button.label}` : button.form.team || button.label };
    });
}

/** Which list entry a button is: its own, or the one it shares. */
export const optionOf = (button) => button?.form?.option || button?.key;

/** The first required question left unanswered, in words — or null when the form may be sent. */
export function missingAnswer(button, answers) {
  for (const field of button?.asks || []) {
    if (field.type === 'items') {
      const rows = (answers[field.key] || []).filter((row) => Object.values(row).some((value) => String(value).trim()));
      if (field.required && !rows.length) return `${field.label}: add at least one row`;
      const column = field.columns.find((entry) => entry.required && rows.some((row) => !String(row[entry.key] || '').trim()));
      if (column) return `${column.label} on every row`;
    } else if (field.required && !String(answers[field.key] ?? '').trim()) {
      return field.label;
    }
  }
  return null;
}

/** Whether this form needs the instruction filled in now — Sampling, beyond three pieces. */
export function noteNeeded(button, answers) {
  const rule = button?.form?.noteRequired;
  if (!rule) return false;
  return (answers[rule.items] || []).some((row) => Number(row[rule.column]) > rule.above);
}

/** What is sent: empty rows dropped, every other answer as the form holds it. */
export function briefToSend(button, answers) {
  const brief = {};
  for (const field of button?.asks || []) {
    if (field.type === 'kind' || field.type === 'info') continue;
    const value = answers[field.key];
    if (field.type === 'items') {
      const rows = (value || []).filter((row) => Object.values(row).some((cell) => String(cell).trim()));
      if (rows.length) brief[field.key] = rows;
    } else if (field.type === 'check') {
      if (value) brief[field.key] = true;
    } else if (String(value ?? '').trim()) {
      brief[field.key] = String(value).trim();
    }
  }
  return brief;
}

/** Today in India, as the date input wants it. */
export const todayInIndia = (now = new Date()) =>
  new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);

/**
 * What a task was asked, in lines: "Mould / model: NH-400 · Colour: Black" for plain answers,
 * and one line per row of a table — "UTJRSH-0 · PP · Black · Compulsory colour · 5 pcs".
 */
/**
 * The same, as label / value pairs for a facts table — a row of a table becomes one entry under
 * the table's label ("Items: NH-400 · PP · Black · 5 pcs"), a plain answer one entry of its own.
 */
/*
 * What a task's answers were called on a form since changed — a quotation request was one line
 * ("Hanger model(s)", one material, one target price) before it took a row per model.
 */
const EARLIER_LABELS = {
  models: 'Hanger model(s)',
  material: 'Material / colour',
  quantity: 'Quantity',
  targetPrice: 'Buyer’s target price (₹ per piece)',
};
const labelOf = (field, key) => field?.label || EARLIER_LABELS[key] || key;

export function briefEntries(button, brief) {
  if (!brief) return [];
  const asks = button?.asks || [];
  const entries = [];
  for (const [key, value] of Object.entries(brief)) {
    const field = asks.find((entry) => entry.key === key);
    if (value === undefined || value === null || value === '' || value === false) continue;
    /* A record's id the app keeps on the brief for itself (the sample a desk task is about). */
    if (field?.hidden) continue;
    if (Array.isArray(value)) {
      for (const row of value) {
        const cells = (field?.columns || Object.keys(row).map((column) => ({ key: column })))
          .filter((column) => row[column.key])
          .map((column) => cellText(column, row[column.key]));
        if (cells.length) entries.push({ key: `${key}-${entries.length}`, label: labelOf(field, key), value: cells.join(' · ') });
      }
    } else {
      /* A number reads as one: 10,000 pieces, not 10000. */
      const shown = value === true ? 'Yes'
        : (field?.type === 'number' || key === 'quantity') && Number.isFinite(Number(value)) && String(value).trim() !== '' ? Number(value).toLocaleString('en-IN')
          : String(value);
      entries.push({ key, label: labelOf(field, key), value: shown });
    }
  }
  return entries;
}

const MONEY_KEYS = ['price', 'targetPrice'];
const pieces = (value) => Number(value).toLocaleString('en-IN');
const rupees = (value) => `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const ticked = (value) => value === true || value === 'Yes' || value === 'true';
const titleCase = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase();

/** One row of a table as a model block: what it is, its parts by name, and how many at what price. */
function rowBlock(row, columns) {
  const [first, ...rest] = columns;
  const parts = [];
  const sums = [];
  const dates = [];
  for (const column of rest) {
    const value = row[column.key];
    if (value == null || String(value).trim() === '') continue;
    if (column.key === 'quantity' || MONEY_KEYS.includes(column.key)) continue;
    if (column.type === 'date') dates.push(`${column.label || 'Date'} ${formatDate(value)}`);
    else parts.push({ label: column.label || titleCase(column.key), value: String(value) });
  }
  const quantity = Number(row.quantity);
  const price = Number(row.price);
  const hasQuantity = row.quantity != null && String(row.quantity).trim() !== '' && Number.isFinite(quantity);
  const hasPrice = row.price != null && String(row.price).trim() !== '' && Number.isFinite(price);
  const value = hasQuantity && hasPrice ? quantity * price : null;
  if (hasQuantity) sums.push(`${pieces(quantity)} pcs`);
  if (hasPrice) sums.push(hasQuantity ? `× ${rupees(price)} = ${rupees(value)}` : `${rupees(price)} / pc`);
  if (row.targetPrice) sums.push(`target ${rupees(row.targetPrice)} / pc`);
  const amount = [sums.join(' '), ...dates].filter(Boolean).join(' · ');
  return { title: String(row[first.key] || '—'), parts, amount: amount || null, quantity: hasQuantity ? quantity : 0, value };
}

/**
 * What a task was asked, laid out as the form asked it [components/TaskHistory.jsx `TaskFacts`] —
 * so the team reads the request as it was entered, not as one run-on line:
 *
 *   facts   label / value, in the form's order; answers from an earlier form after them
 *   checks  each box ticked — and a box the form starts ticked that was unticked (the SO request's
 *           Production confirmed: unticked, the order is held)
 *   tables  a table's rows, one block per model: its parts by name, pieces × price = value and the
 *           EDD, and the total over every row
 */
export function briefSections(button, brief) {
  const sections = { facts: [], checks: [], tables: [] };
  if (!brief) return sections;
  const asks = button?.asks || [];
  const known = asks.filter((field) => field.key in brief || (field.type === 'check' && field.checked));
  const earlier = Object.keys(brief).filter((key) => !asks.some((field) => field.key === key)).map((key) => ({ key }));
  for (const field of [...known, ...earlier]) {
    if (field.hidden || field.type === 'kind' || field.type === 'info') continue;
    const value = brief[field.key];
    if (field.type === 'check') {
      if (ticked(value)) sections.checks.push({ key: field.key, label: field.label, ticked: true });
      else if (field.checked) sections.checks.push({ key: field.key, label: field.label, ticked: false });
      continue;
    }
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      const rows = value.filter((row) => row && Object.values(row).some((cell) => String(cell ?? '').trim()));
      if (!rows.length) continue;
      const columns = field.columns || Object.keys(rows[0]).map((key) => ({ key }));
      const blocks = rows.map((row) => rowBlock(row, columns));
      const quantity = blocks.reduce((sum, block) => sum + block.quantity, 0);
      const priced = blocks.filter((block) => block.value != null);
      const total = blocks.length > 1 && quantity
        ? [`${blocks.length} models`, `${pieces(quantity)} pcs`, priced.length ? rupees(priced.reduce((sum, block) => sum + block.value, 0)) : null].filter(Boolean).join(' · ')
        : null;
      sections.tables.push({ key: field.key, label: labelOf(field, field.key), rows: blocks, total });
      continue;
    }
    const shown = value === true ? 'Yes'
      : (field.type === 'number' || field.key === 'quantity') && Number.isFinite(Number(value)) ? pieces(value)
        : String(value);
    sections.facts.push({ key: field.key, label: labelOf(field, field.key), value: shown });
  }
  return sections;
}

export function describeBrief(button, brief) {
  if (!brief) return [];
  const asks = button?.asks || [];
  const lines = [];
  const plain = [];
  for (const [key, value] of Object.entries(brief)) {
    const field = asks.find((entry) => entry.key === key);
    if (field?.hidden) continue;
    if (Array.isArray(value)) {
      for (const row of value) {
        lines.push((field?.columns || Object.keys(row).map((column) => ({ key: column })))
          .filter((column) => row[column.key])
          .map((column) => cellText(column, row[column.key]))
          .join(' · '));
      }
    } else {
      plain.push(`${labelOf(field, key)}: ${value === true ? 'Yes' : value}`);
    }
  }
  if (plain.length) lines.unshift(plain.join(' · '));
  return lines.filter(Boolean);
}

/** The model details a form may change, and their words [server: itemDetails.service `DETAIL_KEYS`]. */
const DETAIL_WORDS = { material: 'material', colour: 'colour', hook: 'hook', clip: 'clip', print: 'print', packing: 'packing' };

/**
 * What the person changed in the form's model rows from what it started with — the enquiry's (or
 * the job's latest) details: `[{ model, field, from, to }]`. Only a detail given a new value counts;
 * a row added, or a detail cleared, is not a change to the enquiry.
 */
export function changedDetails(started = {}, answers = {}) {
  const changes = [];
  for (const [key, rows] of Object.entries(answers)) {
    if (!Array.isArray(rows) || !Array.isArray(started[key])) continue;
    for (const row of rows) {
      const model = String(row?.model || '').trim();
      if (!model) continue;
      const before = started[key].find((entry) => String(entry?.model || '').trim().toLowerCase() === model.toLowerCase());
      if (!before) continue;
      for (const field of Object.keys(DETAIL_WORDS)) {
        if (!(field in row)) continue;
        const from = String(before[field] ?? '').trim();
        const to = String(row[field] ?? '').trim();
        if (to && to.toLowerCase() !== from.toLowerCase()) changes.push({ model, field: DETAIL_WORDS[field], from, to });
      }
    }
  }
  return changes;
}
