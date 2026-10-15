/**
 * How long the person has been away, shared across tabs.
 *
 * The last touch — a pointer, a key, a scroll, or a request going out [api/client.js] — is kept
 * in localStorage, so working in one tab keeps every tab of the app unlocked, and a tab reopened
 * after a long gap locks at once rather than waiting out its own timer.
 */
const KEY = 'npt.lastActivity';
const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
const THROTTLE_MS = 5000;

let lastWrite = 0;

export function touch(now = Date.now()) {
  if (now - lastWrite < THROTTLE_MS) return;
  lastWrite = now;
  try { localStorage.setItem(KEY, String(now)); } catch { /* storage blocked: the timer runs on this tab alone */ }
}

export function lastActivity() {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : lastWrite || Date.now();
  } catch {
    return lastWrite || Date.now();
  }
}

/** Minutes of nothing, as a number of milliseconds. */
export const idleFor = (now = Date.now()) => Math.max(0, now - lastActivity());

/** True once the idle time has passed the policy's minutes. */
export const idlePast = (minutes, now = Date.now()) => idleFor(now) >= Math.max(1, Number(minutes) || 15) * 60000;

/** Listens for activity on the page; returns the function that stops listening. */
export function watchActivity(onTouch = touch) {
  const handler = () => onTouch();
  for (const name of EVENTS) window.addEventListener(name, handler, { passive: true });
  return () => { for (const name of EVENTS) window.removeEventListener(name, handler); };
}
