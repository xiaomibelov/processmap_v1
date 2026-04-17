import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  apiAuthLogin,
  apiAuthLogout,
  apiAuthMe,
  apiListOrgs,
  apiAuthRefresh,
  clearAccessToken,
  setActiveOrgId as persistActiveOrgId,
  getAccessToken,
  onAuthFailure,
} from "../../lib/api";
import { setTelemetryUserContext } from "../telemetry/telemetryClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [defaultOrgId, setDefaultOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [reauthRequired, setReauthRequired] = useState(false);

  const applyAnonymous = useCallback(() => {
    clearAccessToken();
    persistActiveOrgId("");
    setUser(null);
    setOrgs([]);
    setActiveOrgId("");
    setDefaultOrgId("");
  }, []);

  const hydrateUser = useCallback(async () => {
    const me = await apiAuthMe();
    if (!me.ok) return me;
    setUser(me.user);
    const nextOrgs = Array.isArray(me.user?.orgs) ? me.user.orgs : [];
    const nextDefault = String(me.user?.default_org_id || "").trim();
    const nextActive = String(me.user?.active_org_id || nextDefault || "").trim();
    setOrgs(nextOrgs);
    setDefaultOrgId(nextDefault);
    setActiveOrgId(nextActive);
    return {
      ok: true,
      user: me.user,
      status: me.status,
      orgs: nextOrgs,
      active_org_id: nextActive,
      default_org_id: nextDefault,
    };
  }, []);

  const refreshOrgs = useCallback(async () => {
    const res = await apiListOrgs();
    if (!res.ok) return res;
    const nextOrgs = Array.isArray(res.items) ? res.items : [];
    const nextDefault = String(res.default_org_id || "").trim();
    const nextActive = String(res.active_org_id || nextDefault || "").trim();
    setOrgs(nextOrgs);
    setDefaultOrgId(nextDefault);
    setActiveOrgId(nextActive);
    setUser((prev) => {
      if (!prev) return prev;
      return { ...prev, orgs: nextOrgs, default_org_id: nextDefault, active_org_id: nextActive };
    });
    return {
      ok: true,
      status: res.status,
      orgs: nextOrgs,
      active_org_id: nextActive,
      default_org_id: nextDefault,
    };
  }, []);

  const switchOrg = useCallback(async (orgId, options = {}) => {
    const requested = String(orgId || "").trim();
    if (!requested) return { ok: false, status: 0, error: "org_id required" };
    const exists = orgs.some((item) => String(item?.org_id || "").trim() === requested);
    if (!exists && options?.allowMissing !== true) return { ok: false, status: 404, error: "org not in memberships" };
    persistActiveOrgId(requested);
    setActiveOrgId(requested);
    setUser((prev) => (prev ? { ...prev, active_org_id: requested } : prev));
    if (options?.refreshMe === false) {
      return { ok: true, status: 200, active_org_id: requested };
    }
    const hydrated = await hydrateUser();
    if (!hydrated.ok) return hydrated;
    return { ok: true, status: hydrated.status, active_org_id: String(hydrated.active_org_id || requested).trim() || requested };
  }, [hydrateUser, orgs]);

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

  useEffect(() => {
    setTelemetryUserContext({
      userId: String(user?.id || "").trim(),
      orgId: String(activeOrgId || "").trim(),
    });
  }, [activeOrgId, user?.id]);

  const login = useCallback(async (email, password) => {
    const loginRes = await apiAuthLogin(email, password);
    if (!loginRes.ok) return loginRes;

    const me = await hydrateUser();
    if (!me.ok) {
      applyAnonymous();
      return me;
    }

    setReauthRequired(false);
    return { ok: true, status: loginRes.status, user: me.user, orgs: me.orgs, active_org_id: me.active_org_id };
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
    orgs,
    activeOrgId,
    defaultOrgId,
    isAuthed: Boolean(user?.id),
    loading,
    reauthRequired,
    setReauthRequired,
    login,
    logout,
    switchOrg,
    refreshOrgs,
    refreshMe,
  }), [
    user,
    orgs,
    activeOrgId,
    defaultOrgId,
    loading,
    reauthRequired,
    login,
    logout,
    switchOrg,
    refreshOrgs,
    refreshMe,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
