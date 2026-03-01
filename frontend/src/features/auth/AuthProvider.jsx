import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  apiAuthLogin,
  apiAuthLogout,
  apiAuthMe,
  apiAuthRefresh,
  clearAccessToken,
  getAccessToken,
  onAuthFailure,
} from "../../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reauthRequired, setReauthRequired] = useState(false);

  const applyAnonymous = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  const hydrateUser = useCallback(async () => {
    const me = await apiAuthMe();
    if (!me.ok) return me;
    setUser(me.user);
    return { ok: true, user: me.user, status: me.status };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function boot() {
      setLoading(true);
      const hasAccess = Boolean(getAccessToken());

      if (hasAccess) {
        const me = await hydrateUser();
        if (me.ok) {
          if (!disposed) {
            setReauthRequired(false);
            setLoading(false);
          }
          return;
        }
      }

      const refreshed = await apiAuthRefresh({ silent: true });
      if (refreshed.ok) {
        const me = await hydrateUser();
        if (me.ok) {
          if (!disposed) {
            setReauthRequired(false);
            setLoading(false);
          }
          return;
        }
      }

      if (!disposed) {
        applyAnonymous();
        setReauthRequired(false);
        setLoading(false);
      }
    }

    boot();

    const unsub = onAuthFailure(() => {
      if (disposed) return;
      applyAnonymous();
      setReauthRequired(true);
    });

    return () => {
      disposed = true;
      unsub();
    };
  }, [applyAnonymous, hydrateUser]);

  const login = useCallback(async (email, password) => {
    const loginRes = await apiAuthLogin(email, password);
    if (!loginRes.ok) return loginRes;

    const me = await hydrateUser();
    if (!me.ok) {
      applyAnonymous();
      return me;
    }

    setReauthRequired(false);
    return { ok: true, status: loginRes.status, user: me.user };
  }, [applyAnonymous, hydrateUser]);

  const logout = useCallback(async () => {
    await apiAuthLogout();
    applyAnonymous();
    setReauthRequired(false);
  }, [applyAnonymous]);

  const refreshMe = useCallback(async () => {
    const refreshed = await apiAuthRefresh({ silent: true });
    if (!refreshed.ok) {
      applyAnonymous();
      return refreshed;
    }
    return hydrateUser();
  }, [applyAnonymous, hydrateUser]);

  const value = useMemo(() => ({
    user,
    isAuthed: Boolean(user?.id),
    loading,
    reauthRequired,
    setReauthRequired,
    login,
    logout,
    refreshMe,
  }), [user, loading, reauthRequired, login, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
