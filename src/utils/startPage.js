/**
 * Which page the app opens on for this person on this device: the query list (the default) or
 * Today, the day by role. A convenience, so it lives in the browser — and reading it can fail
 * (a private window, blocked storage), in which case the default stands.
 */
const KEY = 'npt.startPage';

export function startPage() {
  try {
    return window.localStorage.getItem(KEY) === 'today' ? 'today' : 'queries';
  } catch {
    return 'queries';
  }
}

export function setStartPage(page) {
  try {
    window.localStorage.setItem(KEY, page === 'today' ? 'today' : 'queries');
  } catch {
    /* Nothing to do: the default still works. */
  }
}
