import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../api/endpoints.js';
import { clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    // Restore the session on reload; the interceptor clears a rejected token.
    auth
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
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
      isAdmin: user?.role === 'admin',
      /** Replaces the cached user after a profile update. */
      applyUser: setUser,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
