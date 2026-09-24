/**
 * The label rules, as the server holds them (`labelsSchema`). Said before the save so the editor
 * can explain itself; the server still refuses anything that gets past.
 */

/** How a label is stored — the server's `normaliseLabel`, so the chip shows what will be saved. */
export const normaliseLabel = (label) => String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The server's limits, said before the save rather than after the refusal. */
export const MAX_LABELS = 5;
export const LABEL_MAX_LENGTH = 30;
const ALLOWED = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} &/+-]*$/u;

/** Why a label cannot be added, or null. The server holds the same rules and has the last word. */
export function labelProblem(label, current = []) {
  if (label.length < 2) return 'A label needs at least two characters';
  if (label.length > LABEL_MAX_LENGTH) return `Keep a label to ${LABEL_MAX_LENGTH} characters`;
  if (!ALLOWED.test(label)) return 'Use letters, numbers and spaces in a label';
  if (current.includes(label)) return 'That label is already on the query';
  if (current.length >= MAX_LABELS) return `A query carries at most ${MAX_LABELS} labels`;
  return null;
}
