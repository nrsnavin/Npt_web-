/**
 * Which page the app opens on for this person on this device: their home (the default — the
 * enquiries for Admin and Marketing, the department's desk for everyone else
 * [config/simpleNav.js `homeFor`]), the query list, or Today. A convenience, so it lives in the
 * browser — and reading it can fail (a private window, blocked storage), in which case the
 * default stands.
 */
const KEY = 'npt.startPage';
const PAGES = ['home', 'queries', 'today'];

export function startPage() {
  try {
    const stored = window.localStorage.getItem(KEY);
    return PAGES.includes(stored) ? stored : 'home';
  } catch {
    return 'home';
  }
}

export function setStartPage(page) {
  try {
    window.localStorage.setItem(KEY, PAGES.includes(page) ? page : 'home');
  } catch {
    /* Nothing to do: the default still works. */
  }
}
