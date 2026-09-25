/**
 * The list shortcuts, as a pure mapping from a key press to what it means — so the rules about
 * when a key counts (never while typing, never with a modifier held) are tested without a page.
 *
 *   j / ↓  next row        k / ↑  previous row
 *   Enter / o  open        x  tick for filing
 *   l  labels              e  close the query
 *   r  reply               ?  show these
 */
const KEYS = {
  j: 'next', ArrowDown: 'next',
  k: 'previous', ArrowUp: 'previous',
  Enter: 'open', o: 'open',
  x: 'select',
  l: 'label',
  e: 'close',
  r: 'reply',
  '?': 'help',
};

/** Is the press happening inside something the person is typing in? */
export function isTyping(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.isContentEditable);
}

/** What a key press asks the list to do, or null when it is not a list shortcut at all. */
export function listAction(event) {
  if (!event || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isTyping(event.target)) return null;
  /* A dialog on screen owns the keyboard — a menu, a form, the command bar. */
  if (event.target?.closest?.('[role=dialog]')) return null;
  return KEYS[event.key] || null;
}

/** The next row index for a move, held inside the list. */
export function step(current, action, count) {
  if (!count) return -1;
  if (current < 0) return 0;
  if (action === 'next') return Math.min(current + 1, count - 1);
  if (action === 'previous') return Math.max(current - 1, 0);
  return current;
}

export const SHORTCUTS = [
  ['J / K', 'Next / previous query'],
  ['Enter', 'Open it'],
  ['X', 'Tick it (then drag, or # Label)'],
  ['L', 'Labels for it'],
  ['R', 'Reply without opening it'],
  ['E', 'Close it'],
  ['Ctrl K', 'Search or type a command'],
  ['?', 'Show these'],
];
