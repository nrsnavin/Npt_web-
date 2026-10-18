import { todayInIndia } from './taskForm.js';
/**
 * Work orders on the web [server: models/WorkOrder.js, services/workOrder.service.js].
 */
export const WORK_ORDER_STATUS = {
  planned: { label: 'Planned', tone: 'neutral' },
  released: { label: 'Released', tone: 'info' },
  running: { label: 'Running', tone: 'success' },
  paused: { label: 'Paused', tone: 'warn' },
  completed: { label: 'Made', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** The moves a work order offers from its status — the server's `WORK_ORDER_MOVES`, read off its reply. */
export const movesFor = (moves, status) => Object.entries(moves || {})
  .filter(([, recipe]) => recipe.from.includes(status))
  .map(([key, recipe]) => ({ key, ...recipe }));

/** Whether a work order is late against its due date, or will be at its planned end. */
export function lateness(wo, today = new Date()) {
  if (!wo?.dueDate || ['completed', 'cancelled'].includes(wo.status)) return null;
  const due = String(wo.dueDate).slice(0, 10);
  const now = todayInIndia(new Date(today));
  if (due < now) return { tone: 'danger', label: 'Past due' };
  if (wo.plannedEnd && String(wo.plannedEnd).slice(0, 10) > due) return { tone: 'warn', label: 'Plan ends after due' };
  return null;
}

/** Open work orders grouped by press — unplanned first — each press's queue in sequence order. */
export function byPress(rows) {
  const groups = new Map();
  for (const wo of rows) {
    const key = wo.machine?._id || 'none';
    if (!groups.has(key)) groups.set(key, { key, label: wo.machine ? wo.machine.code : 'Not on a press yet', machine: wo.machine || null, rows: [] });
    groups.get(key).rows.push(wo);
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => (a.sequence ?? 1e9) - (b.sequence ?? 1e9) || String(a.plannedStart || '9').localeCompare(String(b.plannedStart || '9')) || String(a.dueDate || '9').localeCompare(String(b.dueDate || '9')));
  }
  return [...groups.values()].sort((a, b) => (a.key === 'none' ? -1 : b.key === 'none' ? 1 : a.label.localeCompare(b.label)));
}
