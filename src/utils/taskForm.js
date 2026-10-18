/**
 * The department task form, as plain functions [components/DepartmentTaskDialog.jsx; server:
 * config/departmentTaskForms.js, handoff.service `taskPrefill`].
 *
 * The server says what each department's form asks and where each answer is filled from; these
 * turn that, and the enquiry's prefill, into the form's starting answers — and back into what
 * is sent. Kept out of the component so they can be tested without a browser.
 */

/** A value from the prefill by its path: "customer.contactPerson", "models", "items". */
export function prefillValue(prefill, path) {
  if (!prefill || !path) return undefined;
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), prefill);
}

const blankRow = (columns) => Object.fromEntries(columns.map((column) => [column.key, '']));

/** A starting answer for one question: from the enquiry when it knows, else empty. */
function startingAnswer(field, prefill) {
  const known = prefillValue(prefill, field.from);
  if (field.type === 'items') {
    const rows = Array.isArray(known) && known.length ? known : [{}];
    return rows.map((row) => ({ ...blankRow(field.columns), ...pick(row, field.columns) }));
  }
  if (field.type === 'check') return Boolean(known);
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
          .map((column) => (column.key === 'quantity' ? `${row[column.key]} pcs` : row[column.key]));
        if (cells.length) entries.push({ key: `${key}-${entries.length}`, label: field?.label || key, value: cells.join(' · ') });
      }
    } else {
      /* A number reads as one: 10,000 pieces, not 10000. */
      const shown = value === true ? 'Yes'
        : (field?.type === 'number' || key === 'quantity') && Number.isFinite(Number(value)) && String(value).trim() !== '' ? Number(value).toLocaleString('en-IN')
          : String(value);
      entries.push({ key, label: field?.label || key, value: shown });
    }
  }
  return entries;
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
          .map((column) => (column.key === 'quantity' ? `${row[column.key]} pcs` : row[column.key]))
          .join(' · '));
      }
    } else {
      plain.push(`${field?.label || key}: ${value === true ? 'Yes' : value}`);
    }
  }
  if (plain.length) lines.unshift(plain.join(' · '));
  return lines.filter(Boolean);
}
