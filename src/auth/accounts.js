/**
 * The accounts signed in on this browser, and which one the app is using.
 *
 * One person can hold several — a manager covering a marketing seat, the reception desk that is
 * three people in a day — and switch from the account menu without typing a password again.
 * Each row keeps the account's token, plain while the account is open, and sealed behind the
 * person's device PIN when they have one [pinCrypto.js]. Locking drops the plain token and
 * keeps the seal; unlocking opens the seal back into the plain token.
 *
 * Guards for a shared plant computer: at most five accounts, and one not used for seven days is
 * forgotten. `npt.token` stays the active account's plain token, which is all the API client
 * reads [api/client.js], so every request still carries one Authorization header and nothing
 * else in the app needs to know there are several accounts.
 *
 * Plain functions over localStorage, so the rules are testable in Node with a storage shim.
 */
const ACCOUNTS_KEY = 'npt.accounts';
const ACTIVE_KEY = 'npt.activeAccount';
const TOKEN_KEY = 'npt.token';

export const MOST_ACCOUNTS = 5;
export const FORGET_AFTER_DAYS = 7;
const DAY_MS = 86400000;

const storage = () => globalThis.localStorage;
const read = () => {
  try {
    const raw = storage().getItem(ACCOUNTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((row) => row && row.id) : [];
  } catch {
    return [];
  }
};
const write = (list) => {
  try {
    storage().setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* A private window with storage blocked: the session still works for this page. */
  }
};
const safe = (fn) => { try { return fn(); } catch { return null; } };
/* A clock that never repeats, so two sign-ins in one millisecond still have an order. */
let lastTick = 0;
const tick = () => { lastTick = Math.max(Date.now(), lastTick + 1); return lastTick; };

/**
 * A PIN-protected account is locked whenever it is not the one in use: leaving it — a switch, a
 * sign-out, another account signing in — drops its plain token and keeps the seal, so nobody
 * handed the tab can switch back into it without the PIN.
 */
function lockOthers(list, keepId) {
  for (const row of list) if (row.id !== keepId && row.sealed) row.token = null;
  return list;
}

/** Mirrors the active account's plain token onto the key the API client reads. */
function mirror(list = read()) {
  const active = list.find((row) => row.id === activeId());
  safe(() => (active?.token ? storage().setItem(TOKEN_KEY, active.token) : storage().removeItem(TOKEN_KEY)));
}

/** What the menu shows of a person: never the token. */
const summary = ({ token, sealed, ...rest }) => ({ ...rest, signedIn: Boolean(token), hasPin: Boolean(sealed), locked: Boolean(sealed) && !token });

export const activeId = () => safe(() => storage().getItem(ACTIVE_KEY)) || null;

/** Every account on this device, most recently used first, without tokens. */
export function listAccounts() {
  return read().sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).map(summary);
}

/** The active account's row with its token and seal — for the auth context only. */
export function activeAccount() {
  const row = read().find((entry) => entry.id === activeId());
  return row || null;
}

export function accountById(id) {
  return read().find((entry) => entry.id === String(id)) || null;
}

/**
 * Forgets accounts unused for a week, and keeps the list to five by dropping the least recently
 * used. Called on load and on every add.
 */
export function pruneAccounts(now = Date.now()) {
  let list = read().filter((row) => now - (row.lastUsedAt || row.addedAt || now) < FORGET_AFTER_DAYS * DAY_MS);
  list.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  if (list.length > MOST_ACCOUNTS) list = list.slice(0, MOST_ACCOUNTS);
  write(list);
  if (activeId() && !list.some((row) => row.id === activeId())) safe(() => storage().removeItem(ACTIVE_KEY));
  mirror(list);
  return list.map(summary);
}

/**
 * A sign-in: the account joins the list (or its row is refreshed) and becomes the active one.
 * The same person signing in again keeps their seal only if the new token is sealed again by
 * the context — a fresh token under an old seal would not open, so the seal is dropped here.
 */
export function adoptAccount(user, token, { roleLabel } = {}) {
  const id = String(user.id || user._id);
  const now = tick();
  const list = lockOthers(read().filter((row) => row.id !== id), id);
  list.push({
    id,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    department: user.department || null,
    roleLabel: roleLabel || null,
    token,
    sealed: null,
    addedAt: accountById(id)?.addedAt || now,
    lastUsedAt: now,
  });
  write(list);
  safe(() => storage().setItem(ACTIVE_KEY, id));
  pruneAccounts(now);
  return summary(accountById(id));
}

/** Makes an account on the list the active one. Its token, if open, becomes the app's. */
export function activate(id) {
  const row = accountById(id);
  if (!row) return null;
  row.lastUsedAt = tick();
  write(lockOthers(read().map((entry) => (entry.id === row.id ? row : entry)), row.id));
  safe(() => storage().setItem(ACTIVE_KEY, row.id));
  mirror();
  return row;
}

/** Updates fields on one account — the token after a password change, the seal, the name. */
export function updateAccount(id, changes) {
  const list = read();
  const row = list.find((entry) => entry.id === String(id));
  if (!row) return null;
  Object.assign(row, changes);
  write(list);
  mirror(list);
  return row;
}

/** Locks: the plain token goes, the seal stays. Only meaningful for an account with a PIN. */
export function dropToken(id) {
  return updateAccount(id, { token: null });
}

/** Removes an account from this device. Returns the next account to use, most recent first. */
export function removeAccount(id) {
  const list = read().filter((entry) => entry.id !== String(id));
  write(list);
  if (activeId() === String(id)) safe(() => storage().removeItem(ACTIVE_KEY));
  mirror(list);
  const [next] = list.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  return next ? summary(next) : null;
}

export function clearAccounts() {
  safe(() => storage().removeItem(ACCOUNTS_KEY));
  safe(() => storage().removeItem(ACTIVE_KEY));
  safe(() => storage().removeItem(TOKEN_KEY));
}

/**
 * A browser from before accounts existed holds only `npt.token`. On first load it becomes an
 * account row once the profile is known [context/AuthContext.jsx], so nobody is signed out by
 * the upgrade.
 */
export const legacyToken = () => (read().length ? null : safe(() => storage().getItem(TOKEN_KEY)));

/**
 * A browser-storage key scoped to the active account, so the start page, the inbox's read
 * marker and the board's filters belong to the person and not to the browser. Without an
 * active account (the login page) the plain key is used.
 */
export const scopedKey = (base) => {
  const id = activeId();
  return id ? `${base}.${id}` : base;
};
