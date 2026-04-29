import { useCallback, useRef } from "react";
import {
  PROCESS_MAP_ROUTE_STATE_KEY,
  buildProcessMapUrl,
  parseProcessMapRoute,
  pushProcessMapHistory,
  replaceProcessMapHistory,
} from "./processMapRouteModel.js";

export function readSelectionFromUrl(win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return { projectId: "", sessionId: "" };
  try {
    const route = parseProcessMapRoute(win.location || win);
    return {
      projectId: String(route.projectId || "").trim(),
      sessionId: String(route.sessionId || "").trim(),
    };
  } catch {
    return { projectId: "", sessionId: "" };
  }
}

export function writeSelectionToUrl({ projectId, sessionId }, win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return;
  try {
    const nextHref = buildProcessMapUrl({
      projectId,
      sessionId,
      source: "internal",
    }, {
      pathname: win.location.pathname || "/app",
      baseSearch: win.location.search || "",
      hash: win.location.hash || "",
    });
    const currentHref = `${win.location.pathname}${win.location.search}${win.location.hash}`;
    if (nextHref !== currentHref) {
      replaceProcessMapHistory({ projectId, sessionId, source: "internal" }, {
        win,
        baseSearch: win.location.search || "",
      });
    }
  } catch {
    // ignore route write failures
  }
}

export function pushSessionSelectionToUrl({ projectId, sessionId }, win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return { ok: false, action: "none", reason: "missing_window" };
  const pid = String(projectId || "").trim();
  const sid = String(sessionId || "").trim();
  if (!pid || !sid) return { ok: false, action: "none", reason: "missing_selection" };
  try {
    const currentRoute = parseProcessMapRoute(win.location || win);
    if (currentRoute.projectId === pid && currentRoute.sessionId === sid) {
      return { ok: true, action: "none", reason: "already_current_session" };
    }
    const parentResult = replaceProcessMapHistory({ projectId: pid, sessionId: "", source: "internal" }, {
      win,
      baseSearch: win.location.search || "",
    });
    const sessionResult = pushProcessMapHistory({ projectId: pid, sessionId: sid, source: "internal" }, {
      win,
      baseSearch: win.location.search || "",
    });
    return {
      ok: true,
      action: sessionResult?.action || "none",
      parentAction: parentResult?.action || "none",
      sessionAction: sessionResult?.action || "none",
      parentUrl: parentResult?.url || "",
      sessionUrl: sessionResult?.url || "",
    };
  } catch {
    return { ok: false, action: "none", reason: "history_write_failed" };
  }
}

export function seedSessionParentHistoryToUrl({ projectId, sessionId }, win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return { ok: false, action: "none", reason: "missing_window" };
  const pid = String(projectId || "").trim();
  const sid = String(sessionId || "").trim();
  if (!pid || !sid) return { ok: false, action: "none", reason: "missing_selection" };
  try {
    const currentRoute = parseProcessMapRoute(win.location || win);
    if (currentRoute.projectId !== pid || currentRoute.sessionId !== sid) {
      return { ok: true, action: "none", reason: "not_current_session_route" };
    }
    const stateRoute = win.history?.state?.[PROCESS_MAP_ROUTE_STATE_KEY];
    if (
      stateRoute
      && String(stateRoute.projectId || "").trim() === pid
      && String(stateRoute.sessionId || "").trim() === sid
      && String(stateRoute.source || "").trim() === "internal"
    ) {
      return { ok: true, action: "none", reason: "already_internal_session" };
    }
    const parentResult = replaceProcessMapHistory({ projectId: pid, sessionId: "", source: "internal" }, {
      win,
      baseSearch: win.location.search || "",
    });
    const sessionResult = pushProcessMapHistory({ projectId: pid, sessionId: sid, source: "internal" }, {
      win,
      baseSearch: win.location.search || "",
    });
    return {
      ok: true,
      action: "seed",
      parentAction: parentResult?.action || "none",
      sessionAction: sessionResult?.action || "none",
      parentUrl: parentResult?.url || "",
      sessionUrl: sessionResult?.url || "",
    };
  } catch {
    return { ok: false, action: "none", reason: "history_seed_failed" };
  }
}

export function shouldPreserveSelectionRouteDuringRestore({
  projectId,
  sessionId,
  requestedSessionId,
  urlProjectId,
  urlSessionId,
}) {
  const pid = String(projectId || "").trim();
  const sid = String(sessionId || "").trim();
  const requestedSid = String(requestedSessionId || "").trim();
  const routePid = String(urlProjectId || "").trim();
  const routeSid = String(urlSessionId || "").trim();
  if (sid) return false;
  if (!requestedSid) return false;
  return requestedSid === routeSid || (!!routePid && !pid);
}

export function shouldSkipDuplicateUrlRestore({
  currentSessionId,
  requestedSessionId,
  activeSessionId,
  confirmedSessionId,
  urlSessionId,
  requestedExists,
}) {
  const currentSid = String(currentSessionId || "").trim();
  const requestedSid = String(requestedSessionId || "").trim();
  const activeSid = String(activeSessionId || "").trim();
  const confirmedSid = String(confirmedSessionId || "").trim();
  const routeSid = String(urlSessionId || "").trim();
  if (currentSid || !requestedExists) return false;
  if (!requestedSid || requestedSid !== routeSid) return false;
  return requestedSid === confirmedSid || requestedSid === activeSid;
}

export default function useSessionRouteOrchestration() {
  const initialSelectionRef = useRef(readSelectionFromUrl());
  const requestedSessionIdRef = useRef(String(initialSelectionRef.current?.sessionId || "").trim());
  const activeSessionIdRef = useRef("");
  const confirmedSessionIdRef = useRef("");

  const setRequestedSessionId = useCallback((sessionIdRaw) => {
    const sid = String(sessionIdRaw || "").trim();
    requestedSessionIdRef.current = sid;
    return sid;
  }, []);

  const rememberActiveSessionId = useCallback((sessionIdRaw) => {
    const sid = String(sessionIdRaw || "").trim();
    if (!sid) return String(activeSessionIdRef.current || "").trim();
    activeSessionIdRef.current = sid;
    return sid;
  }, []);

  const rememberConfirmedSessionId = useCallback((sessionIdRaw) => {
    const sid = String(sessionIdRaw || "").trim();
    confirmedSessionIdRef.current = sid;
    return sid;
  }, []);

  const clearSessionRestoreMemory = useCallback(() => {
    requestedSessionIdRef.current = "";
    activeSessionIdRef.current = "";
    confirmedSessionIdRef.current = "";
  }, []);

  return {
    initialSelectionRef,
    requestedSessionIdRef,
    activeSessionIdRef,
    confirmedSessionIdRef,
    setRequestedSessionId,
    rememberActiveSessionId,
    rememberConfirmedSessionId,
    clearSessionRestoreMemory,
  };
}
