import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../api/endpoints.js';
import { clearToken, getToken, hideToken, onUnauthorized, setToken } from '../api/client.js';
import {
  accountById, activate, activeAccount, activeId, adoptAccount, clearAccounts, dropToken, legacyToken, listAccounts, pruneAccounts,
  removeAccount, updateAccount,
} from '../auth/accounts.js';
import { canSeal, openToken, sealToken } from '../auth/pinCrypto.js';
import { unwrapToken, wrapToken } from '../auth/deviceKey.js';
import { idlePast, touch, watchActivity } from '../auth/idle.js';
import { forgetPushForMe, syncPush } from '../utils/push.js';

const AuthContext = createContext(null);

/** Wrong PINs before the account is signed out of this device. */
export const PIN_TRIES = 5;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(activeAccount()?.token) || Boolean(legacyToken()) || Boolean(activeAccount()?.sealed));
  /* Set when the server could not be asked who this is — as opposed to answering "nobody". */
  const [unreachable, setUnreachable] = useState(null);
  /*
   * Several accounts on this browser [auth/accounts.js]: the list for the menu, and whether the
   * active one is locked behind its device PIN — the plain token gone, only the seal left.
   */
  const [accounts, setAccounts] = useState(() => listAccounts());
  const [locked, setLocked] = useState(() => Boolean(activeAccount()?.sealed) && !activeAccount()?.token);
  const [pinTries, setPinTries] = useState(0);
  const refreshAccounts = useCallback(() => setAccounts(listAccounts()), []);
  const roleLabelOf = (person) => (person?.role === 'admin' ? 'Admin' : null);
  /* A note for the person — a switched-to session that had lapsed — shown by the layout or the login page. */
  const [notice, setNotice] = useState(null);

  /*
   * Restoring the session on load.
   *
   * **Only a 401 ends a session.** This used to clear the token on *any* failure of the check —
   * a timeout, a 500, a 429, a phone losing signal at the loading bay — so reopening the app
   * during a network blip signed the person out, and a rate-limited burst signed out whoever
   * happened to reload. Found by the audit sweep: one role's later calls all came back 401
   * because the app had thrown a perfectly valid session away.
   *
   * A 401 is the server saying the token is no good, and the client interceptor already clears
   * it. Anything else means the question went unanswered, so the token is kept and the screen
   * offers to try again rather than sending the person to a login they do not need.
   */
  const restore = useCallback(async () => {
    if (!getToken()) {
      /* The active account's token, wrapped in storage, opened into memory for this tab. */
      const row = activeAccount();
      const plain = row?.token ? await unwrapToken(row.token) : null;
      if (plain) setToken(plain);
      else if (row?.token) updateAccount(row.id, { token: null });
    }
    if (!getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setUnreachable(null);
    auth
      .me()
      .then(async (me) => {
        setUser(me);
        /* A browser from before accounts existed: its one session becomes an account row. */
        if (legacyToken()) adoptAccount(me, await wrapToken(getToken()), { roleLabel: roleLabelOf(me) });
        else updateAccount(me.id, { name: me.name, email: me.email, phone: me.phone, department: me.department, roleLabel: roleLabelOf(me), expiresAt: me.sessionExpiresAt || null });
        refreshAccounts();
      })
      .catch((failure) => {
        if (failure?.response?.status === 401) return;
        setUnreachable(failure);
      })
      .finally(() => setLoading(false));
  }, [refreshAccounts]);

  useEffect(() => {
    pruneAccounts();
    refreshAccounts();
    restore();
  }, [restore, refreshAccounts]);

  /** A sign-in of any kind: the account joins the device and becomes the active one. */
  const adopt = useCallback(async (data) => {
    adoptAccount(data.user, await wrapToken(data.token), { roleLabel: roleLabelOf(data.user) });
    setToken(data.token);
    setLocked(false);
    setPinTries(0);
    setUser(data.user);
    refreshAccounts();
    touch();
    return data.user;
  }, [refreshAccounts]);

  /**
   * Moving to another account on this device. With its token open, the app simply becomes that
   * person; with only a seal, the lock screen asks for their PIN first. Either way the previous
   * person's screens are gone — the app remounts on the user id [App.jsx `RequireAuth`].
   */
  const switchTo = useCallback(async (id) => {
    const row = activate(id);
    if (!row) return null;
    /* The token in memory is the previous person's [api/client.js]: replaced, or gone until the PIN opens the seal. */
    const plain = row.token ? await unwrapToken(row.token) : null;
    if (plain) setToken(plain); else clearToken();
    if (!plain && row.token) updateAccount(row.id, { token: null });
    setUser(null);
    setUnreachable(null);
    setPinTries(0);
    refreshAccounts();
    if (plain) {
      setLocked(false);
      setLoading(true);
      try {
        const me = await auth.me();
        setUser(me);
        updateAccount(me.id, { name: me.name, department: me.department, roleLabel: roleLabelOf(me), expiresAt: me.sessionExpiresAt || null });
        auth.switched().catch(() => null);
        touch();
      } catch (failure) {
        if (failure?.response?.status !== 401) setUnreachable(failure);
      } finally {
        setLoading(false);
      }
      refreshAccounts();
      return row;
    }
    /* Sealed, or signed out: the lock screen (or the login page, prefilled) takes it from here. */
    setLocked(Boolean(row.sealed));
    setLoading(false);
    return row;
  }, [refreshAccounts]);

  /** Signs the active account out of this device and moves to the next one, if any. */
  const logout = useCallback(async () => {
    /* Asked while this account's token is still the one in use; a slow network does not hold the sign-out up. */
    await Promise.race([forgetPushForMe().catch(() => null), new Promise((resolve) => setTimeout(resolve, 1500))]);
    const next = removeAccount(activeId());
    clearToken();
    setUser(null);
    setLocked(false);
    setPinTries(0);
    refreshAccounts();
    if (next) await switchTo(next.id);
  }, [refreshAccounts, switchTo]);

  /*
   * A token the server refuses — lapsed, the account deleted or offboarded, the password
   * changed elsewhere. Only that account goes; another one on the device takes over, or the
   * login page does [api/client.js]. The 401 that comes mid-request is handled once, here.
   */
  useEffect(() => onUnauthorized(() => {
    const id = activeId();
    if (!id) return false;
    const gone = accountById(id);
    const next = removeAccount(id);
    if (gone) setNotice(`${gone.name}’s sign-in has ended on this device. Sign in again to add it back.`);
    clearToken();
    setUser(null);
    setLocked(false);
    refreshAccounts();
    if (next) {
      switchTo(next.id);
      return true;
    }
    return false;
  }), [refreshAccounts, switchTo]);

  /*
   * This device keeps ringing for whoever is signed in [utils/push.js `syncPush`]: once for each
   * person who comes to the screen — open, sign-in, switch, unlock — and again, at most every ten
   * minutes, when the app is brought back to the front.
   */
  useEffect(() => {
    if (!user?.id || locked) return undefined;
    syncPush({ force: true }).catch(() => null);
    const onVisible = () => { if (document.visibilityState === 'visible') syncPush().catch(() => null); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, locked]);

  /* The idle lock: the policy's minutes with nothing from the person, and the account has a PIN. */
  const minutes = user?.policy?.lockAfterMinutes || 15;
  const lock = useCallback(() => {
    const row = activeAccount();
    if (!row?.sealed || !row.token) return false;
    dropToken(row.id);
    hideToken();
    setLocked(true);
    setPinTries(0);
    refreshAccounts();
    return true;
  }, [refreshAccounts]);
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    if (!user || !activeAccount()?.sealed) return undefined;
    touch();
    const stop = watchActivity();
    const check = () => { if (idlePast(minutes)) lockRef.current(); };
    const timer = setInterval(check, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, minutes, accounts]);

  /*
   * The other tabs. A lock or an unlock in one tab is the whole browser's: storage carries the
   * token away and back. A switch in another tab is its own choice of person, and this tab
   * reloads into it rather than quietly showing one person's screens with another's session.
   */
  useEffect(() => {
    const onStorage = async (event) => {
      if (event.key === 'npt.token') {
        if (event.newValue === null && activeAccount()?.sealed) { hideToken(); setLocked(true); }
        else if (event.newValue && locked) {
          const plain = await unwrapToken(event.newValue);
          if (!plain) return;
          setToken(plain);
          setLocked(false);
          setPinTries(0);
          /* This tab opened straight onto the lock screen and has nobody loaded yet. */
          if (!user) restore();
        }
      }
      if (event.key === 'npt.activeAccount' && event.newValue !== event.oldValue && event.newValue !== (user?.id || null)) {
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [locked, user, restore]);

  /* Ctrl+L (⌘L) locks — and Ctrl+Shift+L, for the browsers that keep Ctrl+L for the address bar. */
  useEffect(() => {
    if (!user || locked || !activeAccount()?.sealed) return undefined;
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        lockRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [user, locked, accounts]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      unreachable,
      retrySession: restore,
      async login(credentials) {
        return adopt(await auth.login(credentials));
      },
      /** Sets a password from an emailed link and signs in with the session that comes back. */
      async resetPassword(token, password) {
        return adopt(await auth.resetPassword({ token, password }));
      },
      /** Step one of OTP sign-in — returns the masked identifier and channel. */
      requestOtp(identifier) {
        return auth.requestOtp(identifier);
      },
      /** Step two of OTP sign-in — redeems the code for a session. */
      async verifyOtp(identifier, code) {
        return adopt(await auth.verifyOtp({ identifier, code }));
      },
      /**
       * Changing the password ends every session issued before it, this one included — so the
       * fresh token that comes back has to replace the stored one, or the next call signs the
       * person out of the device they just changed it on. A PIN seals the old token, so it is
       * dropped: the person sets it again from the profile.
       */
      async changePassword(payload) {
        const data = await auth.changePassword(payload);
        setToken(data.token);
        updateAccount(data.user.id, { token: await wrapToken(data.token), sealed: null });
        setUser(data.user);
        refreshAccounts();
        return data.user;
      },
      logout,
      /** Every account off this device. */
      signOutAll() {
        clearAccounts();
        setUser(null);
        setLocked(false);
        refreshAccounts();
      },
      setUser,

      /* ------------------------- Several accounts, and the PIN ------------------------- */

      /** The accounts on this device, most recently used first, the active one marked. */
      accounts: accounts.map((row) => ({ ...row, active: row.id === activeId() })),
      switchTo,
      locked,
      /** The account the lock screen is for: the active one, by name, without a session yet. */
      lockedAccount: locked ? activeAccount() && { id: activeAccount().id, name: activeAccount().name, email: activeAccount().email, roleLabel: activeAccount().roleLabel, department: activeAccount().department, expiresAt: activeAccount().expiresAt } : null,
      notice,
      clearNotice: () => setNotice(null),
      /* Counted on the account row, not in memory: a reload does not hand out fresh tries. */
      pinTriesLeft: PIN_TRIES - (activeAccount()?.tries || 0),
      /** The plant's policy, from the profile: a PIN for everyone, and the idle minutes. */
      policy: user?.policy || { pinRequired: false, lockAfterMinutes: 15 },
      hasPin: Boolean(accounts.find((row) => row.id === activeId())?.hasPin),
      canSetPin: canSeal(),
      /** Locks now — the account menu's "Lock". */
      lock,
      /**
       * The PIN opens the seal into the token; the app carries on where it was. Five wrong tries
       * sign the account out of this device, and the full sign-in is needed again.
       */
      async unlock(pin) {
        const row = activeAccount();
        if (!row?.sealed) return { ok: true };
        try {
          const token = await openToken(row.sealed, pin);
          updateAccount(row.id, { token: await wrapToken(token), tries: 0 });
          setToken(token);
          setLocked(false);
          setPinTries(0);
          touch();
          refreshAccounts();
          if (!user) restore();
          return { ok: true };
        } catch {
          const tries = (row.tries || 0) + 1;
          updateAccount(row.id, { tries });
          setPinTries(tries);
          if (tries >= PIN_TRIES) {
            const next = removeAccount(row.id);
            clearToken();
            setLocked(false);
            setPinTries(0);
            refreshAccounts();
            if (next) switchTo(next.id);
            return { ok: false, signedOut: true, next };
          }
          return { ok: false, triesLeft: PIN_TRIES - tries };
        }
      },
      /** Seals the active account's token behind a PIN. Changing one needs the current PIN. */
      async setPin(pin, { current } = {}) {
        const row = activeAccount();
        const plain = getToken();
        if (!row?.token || !plain) throw new Error('Sign in first.');
        if (row.sealed && !(await openToken(row.sealed, current || '').catch(() => null))) throw new Error('The current PIN is wrong.');
        updateAccount(row.id, { sealed: await sealToken(plain, pin) });
        touch();
        refreshAccounts();
      },
      /** Removes the PIN; the current one is needed. Refused when the plant requires a PIN. */
      async clearPin(current) {
        const row = activeAccount();
        if (!row?.sealed) return;
        if (user?.policy?.pinRequired) throw new Error('A PIN is required for everyone here. You can change it, not remove it.');
        await openToken(row.sealed, current || '');
        updateAccount(row.id, { sealed: null });
        refreshAccounts();
      },
      /** True when the policy wants a PIN and this account has none yet: the app asks before anything else. */
      mustSetPin: Boolean(user?.policy?.pinRequired) && !accounts.find((row) => row.id === activeId())?.hasPin && canSeal(),

      /** Admin passes every check, mirroring the server's authorize middleware. */
      can(...roles) {
        if (!user) return false;
        return user.role === 'admin' || roles.length === 0 || roles.includes(user.role);
      },
      /** True when the signed-in user may open a module. */
      canRead(moduleKey) {
        return Boolean(user?.modules?.find((module) => module.key === moduleKey)?.canRead);
      },
      /** True when they may change anything in it. */
      canWrite(moduleKey) {
        return Boolean(user?.modules?.find((module) => module.key === moduleKey)?.canWrite);
      },
      /**
       * True when they may raise and send a quotation.
       *
       * The middle level, and only pricing has one: quoting is not costing, so marketing may
       * write the document the buyer receives without being shown the cost behind the price.
       * Anywhere else this is the same answer as `canWrite`, because nowhere else offers it.
       */
      canQuote(moduleKey) {
        return Boolean(user?.modules?.find((module) => module.key === moduleKey)?.canQuote);
      },
      isAdmin: user?.role === 'admin',
      /**
       * Admin as the department screens and tasks mean it [server: utils/departments.js
       * `isManagement`]: the admin role, or the Admin (management) department, main or extra. The
       * server hands these people every department's tasks and lets them move any; `isAdmin`
       * stays the role alone, for what the server keeps to the role (users, integrations).
       */
      isManagement: user?.role === 'admin' || (user?.departments || [user?.department]).includes('management'),
      /**
       * Whether this person may open a customer record: a salesperson (marketing as their main
       * department) only the customers allocated to them; everybody else, and Admin, any
       * [server: ownership.service `ownsCustomer`]. A delegated enquiry's buyer can be someone
       * else's — its name is shown, not linked. Unknown owner: assume it opens.
       */
      opensCustomer(customer) {
        const salesperson = user?.department === 'marketing'
          && !(user?.role === 'admin' || (user?.departments || [user?.department]).includes('management'));
        const owner = customer?.assignedTo?._id || customer?.assignedTo;
        if (!salesperson || !owner) return true;
        return String(owner) === String(user?._id || user?.id);
      },
      /**
       * Plans Production's work [server: utils/departments.js `isProductionInCharge`]: gives the
       * EDD and hand-over dates, decides printing / assembly per model, adds to the production
       * queue. The Production in charge — anyone Admin marks, from any department — or Admin;
       * the rest of Production moves the statuses.
       */
      mayPlanProduction: user?.role === 'admin' || (user?.departments || [user?.department]).includes('management')
        || user?.productionInCharge === true,
      /** Every department this person works in, their main one first [server: utils/departments.js]. */
      departments: user?.departments || (user?.department ? [user.department] : []),
      /** True when they work in that department, as their main one or an extra one. */
      worksIn(key) {
        return Boolean(key) && (user?.departments || [user?.department]).includes(key);
      },
      /** Only Admin deletes records — the admin role or the Admin department [server: adminOnly]. */
      mayDelete: user?.role === 'admin' || (user?.departments || [user?.department]).includes('management'),
      /** Replaces the cached user after a profile update. */
      applyUser: setUser,
    }),
    [user, loading, unreachable, restore, adopt, accounts, switchTo, logout, locked, pinTries, lock, refreshAccounts, notice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
