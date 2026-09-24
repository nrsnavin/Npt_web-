import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../api/endpoints.js';
import { clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  /* Set when the server could not be asked who this is — as opposed to answering "nobody". */
  const [unreachable, setUnreachable] = useState(null);

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
  const restore = useCallback(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setUnreachable(null);
    auth
      .me()
      .then(setUser)
      .catch((failure) => {
        if (failure?.response?.status === 401) return;
        setUnreachable(failure);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      unreachable,
      retrySession: restore,
      async login(credentials) {
        const data = await auth.login(credentials);
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async register(payload) {
        const data = await auth.register(payload);
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      /** Step one of OTP sign-in — returns the masked identifier and channel. */
      requestOtp(identifier) {
        return auth.requestOtp(identifier);
      },
      /** Step two of OTP sign-in — redeems the code for a session. */
      async verifyOtp(identifier, code) {
        const data = await auth.verifyOtp({ identifier, code });
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      /**
       * Changing the password ends every session issued before it, this one included — so the
       * fresh token that comes back has to replace the stored one, or the next call signs the
       * person out of the device they just changed it on.
       */
      async changePassword(payload) {
        const data = await auth.changePassword(payload);
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      logout() {
        clearToken();
        setUser(null);
      },
      setUser,
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
      /** Replaces the cached user after a profile update. */
      applyUser: setUser,
    }),
    [user, loading, unreachable, restore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
