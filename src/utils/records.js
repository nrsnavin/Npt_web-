/**
 * The words for the plant's records [server: models/QcRecord.js, Machine.js, MaintenanceRecord.js,
 * MouldRun.js] — the keys are the server's, the labels what the floor calls them.
 */

export const QC_STAGES = [
  { value: 'incoming', label: 'Incoming material', hint: 'Resin, masterbatch, hooks or clips as they arrive' },
  { value: 'first_off', label: 'First piece', hint: 'The first good shots after setting the mould' },
  { value: 'in_process', label: 'On the press', hint: 'During the run' },
  { value: 'final', label: 'Final', hint: 'The finished lot' },
  { value: 'pre_dispatch', label: 'Before dispatch', hint: 'What is going to the buyer' },
  { value: 'complaint', label: 'Customer complaint', hint: 'Pieces sent back, or a complaint checked' },
];

export const MOULDING_TYPES = [
  { value: 'injection', label: 'Injection moulding' },
  { value: 'two_colour', label: 'Two-colour / two-shot' },
  { value: 'insert', label: 'Insert moulding (metal hook in the mould)' },
  { value: 'injection_assembly', label: 'Injection + assembly (hook / clips fitted after)' },
];

export const PRINT_TYPES = [
  { value: 'none', label: 'No print' },
  { value: 'pad', label: 'Pad print' },
  { value: 'screen', label: 'Screen print' },
  { value: 'hot_stamp', label: 'Hot stamping / foil' },
  { value: 'size_marker', label: 'Size marker / size cap' },
];

export const SHIFTS = ['A', 'B', 'C', 'General'];

export const QC_VERDICTS = [
  { value: 'passed', label: 'Passed', tone: 'success' },
  { value: 'passed_with_deviation', label: 'Passed with deviation', tone: 'progress' },
  { value: 'rejected', label: 'Rejected', tone: 'danger' },
  { value: 'on_hold', label: 'On hold', tone: 'neutral' },
];

export const MACHINE_STATUSES = [
  { value: 'running', label: 'Running', tone: 'success' },
  { value: 'idle', label: 'Idle', tone: 'neutral' },
  { value: 'breakdown', label: 'Breakdown', tone: 'danger' },
  { value: 'maintenance', label: 'Under maintenance', tone: 'progress' },
  { value: 'retired', label: 'Retired', tone: 'neutral' },
];

export const MAINTENANCE_TYPES = [
  { value: 'preventive', label: 'Preventive / scheduled' },
  { value: 'breakdown', label: 'Breakdown repair' },
  { value: 'cleaning', label: 'Cleaning / greasing' },
  { value: 'polishing', label: 'Polishing (mould)' },
  { value: 'repair', label: 'Repair / modification' },
  { value: 'overhaul', label: 'Overhaul' },
  { value: 'inspection', label: 'Inspection / check' },
];

export const RUN_STATUSES = [
  { value: 'running', label: 'Running', tone: 'success' },
  { value: 'completed', label: 'Completed', tone: 'neutral' },
  { value: 'aborted', label: 'Stopped early', tone: 'danger' },
];

export const labelOf = (list, value) => list.find((entry) => entry.value === value)?.label || value || '';
export const toneOf = (list, value) => list.find((entry) => entry.value === value)?.tone || 'neutral';

/** A test's result in words, and the colour it reads in. */
export const RESULT = {
  pass: { label: 'Pass', tone: 'success' },
  fail: { label: 'Fail', tone: 'danger' },
  not_tested: { label: 'Not tested', tone: 'neutral' },
};

const round1 = (value) => Math.round(value * 10) / 10;
const within = (actual, target, tolerance) => Math.abs(actual - target) <= (tolerance || 0);
const known = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));

/**
 * The same working-out the server does [server: records.service `workOut`], so the form shows
 * the result as the figures are typed. The server's answer is the one saved.
 */
export function workOut(sheet) {
  const samples = (sheet.breaking?.samplesKg || []).filter(known).map(Number);
  const breaking = samples.length
    ? {
      minKg: Math.min(...samples),
      maxKg: Math.max(...samples),
      avgKg: round1(samples.reduce((sum, value) => sum + value, 0) / samples.length),
    }
    : {};
  if (samples.length && known(sheet.breaking?.requiredKg)) breaking.result = breaking.minKg >= Number(sheet.breaking.requiredKg) ? 'pass' : 'fail';
  const compare = (actual, wanted, pass) => (known(actual) && known(wanted) ? (pass(Number(actual), Number(wanted)) ? 'pass' : 'fail') : undefined);
  return {
    breaking,
    hook: compare(sheet.hook?.pullActualKg, sheet.hook?.pullRequiredKg, (a, w) => a >= w),
    clip: compare(sheet.clip?.gripActualKg, sheet.clip?.gripRequiredKg, (a, w) => a >= w),
    weight: known(sheet.weight?.actual) && known(sheet.weight?.target) ? (within(Number(sheet.weight.actual), Number(sheet.weight.target), Number(sheet.weight.tolerance) || 0) ? 'pass' : 'fail') : undefined,
    hang: compare(sheet.hangLoad?.deflectionMm, sheet.hangLoad?.allowedDeflectionMm, (a, w) => a <= w),
    measurements: (sheet.measurements || []).map((row) => (known(row.actual) && known(row.target) ? (within(Number(row.actual), Number(row.target), Number(row.tolerance) || 0) ? 'pass' : 'fail') : undefined)),
  };
}

/* ----------------------------------------------------------- QC prefill --- */

const PREFILL_PATHS = [
  'modelNumber', 'size', 'mould', 'mouldingType', 'cavities', 'lotSize',
  'resin.material', 'resin.name', 'resin.colour', 'resin.supplier',
  'hook.type', 'hook.finish', 'clip.type', 'print.type', 'print.colour', 'print.artwork', 'weight.target',
];
const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const blankMeasures = (rows) => rows.every((row) => row.target === '' && row.tolerance === '' && row.actual === '');

/**
 * The prefill laid over the sheet: the enquiry, SO and line it found when they were empty, and each
 * field where the box is empty or still holds what the last prefill put there. `before` is what
 * the last one put, so a changed line swaps its own figures and leaves the inspector's alone. Pure —
 * it returns the sheet and what it put, for the caller to remember.
 */
export function fillFrom(current, answer, before = {}) {
  const next = structuredClone(current);
  if (!next.enquiry && answer.enquiry) next.enquiry = answer.enquiry._id;
  if (!next.order && answer.order) next.order = answer.order._id;
  if (answer.lineKind === 'order' && !next.orderLine && answer.line) next.orderLine = answer.line;
  const now = {};
  for (const path of PREFILL_PATHS) {
    const value = at(answer.fields, path);
    const mine = at(next, path);
    if (value !== undefined) now[path] = value;
    if (mine === '' || mine === undefined || (path in before && mine === before[path])) {
      const keys = path.split('.');
      let target = next;
      keys.slice(0, -1).forEach((key) => { target = target[key]; });
      target[keys.at(-1)] = value ?? '';
    }
  }
  const measures = answer.fields.measurements;
  if (measures && (blankMeasures(next.measurements) || JSON.stringify(next.measurements) === before.measurements)) {
    next.measurements = measures.map((row) => ({ name: row.name, unit: row.unit || 'mm', target: row.target ?? '', tolerance: '', actual: '' }));
    now.measurements = JSON.stringify(next.measurements);
  }
  return { sheet: next, filled: now };
}
