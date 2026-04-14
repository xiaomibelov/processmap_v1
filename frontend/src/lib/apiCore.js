import { apiFetch, normalizeApiErrorPayload } from "./apiClient.js";
import { apiRoutes } from "./apiRoutes.js";

// Single source of truth for API calls (FPC)
const ACCESS_TOKEN_KEY = "fpc_auth_access_token";
const ACTIVE_ORG_KEY = "fpc_active_org_id";
const AUTH_RETRY_BLOCKLIST = new Set([
  apiRoutes.auth.login(),
  apiRoutes.auth.refresh(),
  apiRoutes.auth.logout(),
  apiRoutes.auth.invitePreview(),
  apiRoutes.auth.inviteActivate(),
  apiRoutes.invite.resolve(),
  apiRoutes.invite.activate(),
]);
const authFailureListeners = new Set();

let accessToken = "";
let activeOrgId = "";
let refreshInFlight = null;
let refreshWaiters = 0;
let requestSeq = 0;

function readStoredAccessToken() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage?.getItem(ACCESS_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

accessToken = readStoredAccessToken();

function readStoredActiveOrgId() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage?.getItem(ACTIVE_ORG_KEY) || "").trim();
  } catch {
    return "";
  }
}

activeOrgId = readStoredActiveOrgId();

function emitAuthFailure(reason = "unauthorized") {
  authFailureListeners.forEach((fn) => {
    try {
      fn(String(reason || "unauthorized"));
    } catch {
      // ignore listener errors
    }
  });
}

function shouldLogAuthTrace() {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage;
    return String(ls?.getItem("fpc_debug_trace") || "").trim() === "1"
      || String(ls?.getItem("DEBUG_LOOP") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logAuthTrace(tag, payload = {}) {
  if (!shouldLogAuthTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AUTH_TRACE] ${String(tag || "trace")} ${suffix}`.trim());
}

export function normalizeNotes(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    // keep as plain legacy text note
  }
  return [{ note_id: "legacy", ts: null, author: null, text }];
}

function normalizeApiErrorText(raw, depth = 0) {
  if (depth > 3) return "";
  if (typeof raw === "string") {
    const text = raw.trim();
    return text && text !== "[object Object]" ? text : "";
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw).trim();
  }
  if (!raw || typeof raw !== "object") return "";

  const value = raw;
  const direct = normalizeApiErrorText(
    value.message
    || value.error
    || value.reason
    || value.title
    || value.detail,
    depth + 1,
  );
  if (direct) return direct;

  const code = normalizeApiErrorText(value.code, depth + 1);
  if (code) return code;

  try {
    const json = JSON.stringify(value);
    return typeof json === "string" && json !== "{}" ? json : "";
  } catch {
    return "";
  }
}

export function okOrError(r) {
  if (!r.ok) return r;
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data) && (r.data.error || r.data.detail)) {
    const errText = normalizeApiErrorText(r.data.error || r.data.detail || r.data) || "request failed";
    const marker = errText.toLowerCase();
    const inferredStatus = marker.includes("not found")
      ? 404
      : marker.includes("unauthorized")
        ? 401
        : marker.includes("forbidden")
          ? 403
          : (marker.includes("required") || marker.includes("missing") || marker.includes("invalid"))
            ? 422
            : (r.status || 200);
    return {
      ok: false,
      status: inferredStatus,
      error: errText,
      data: r.data,
      method: r.method,
      endpoint: r.endpoint,
      url: r.url,
      text: r.text,
      response_text: r.response_text || r.text,
    };
  }
  return r;
}

export function getAccessToken() {
  return String(accessToken || "");
}

export function setAccessToken(token, options = {}) {
  const next = String(token || "").trim();
  accessToken = next;
  const persist = options?.persist !== false;
  if (typeof window !== "undefined" && persist) {
    try {
      if (next) window.localStorage?.setItem(ACCESS_TOKEN_KEY, next);
      else window.localStorage?.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
  }
  return accessToken;
}

export function clearAccessToken() {
  return setAccessToken("");
}

export function getActiveOrgId() {
  return String(activeOrgId || "");
}

export function setActiveOrgId(orgId, options = {}) {
  const next = String(orgId || "").trim();
  activeOrgId = next;
  const persist = options?.persist !== false;
  if (typeof window !== "undefined" && persist) {
    try {
      if (next) window.localStorage?.setItem(ACTIVE_ORG_KEY, next);
      else window.localStorage?.removeItem(ACTIVE_ORG_KEY);
    } catch {
      // ignore storage errors
    }
  }
  return activeOrgId;
}

export function onAuthFailure(listener) {
  if (typeof listener !== "function") return () => {};
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

async function refreshAccessTokenLocked(meta = {}) {
  if (refreshInFlight) {
    refreshWaiters += 1;
    logAuthTrace("refresh_wait", {
      requestId: Number(meta?.requestId || 0),
      reason: String(meta?.reason || "unknown"),
      waiters: refreshWaiters,
    });
    try {
      return await refreshInFlight;
    } finally {
      refreshWaiters = Math.max(0, refreshWaiters - 1);
    }
  }
  logAuthTrace("refresh_start", {
    requestId: Number(meta?.requestId || 0),
    reason: String(meta?.reason || "unknown"),
  });
  refreshInFlight = (async () => {
    const refreshResult = await apiFetch({
      path: apiRoutes.auth.refresh(),
      method: "POST",
      auth: false,
      withOrgHeader: false,
    });
    if (!refreshResult.ok) {
      clearAccessToken();
      logAuthTrace("refresh_fail", {
        requestId: Number(meta?.requestId || 0),
        status: Number(refreshResult.status || 0),
      });
      return {
        ok: false,
        status: Number(refreshResult.status || 0),
        error: normalizeApiErrorPayload(refreshResult?.data) || String(refreshResult?.error || "refresh_failed"),
      };
    }

    const payload = refreshResult.data && typeof refreshResult.data === "object" ? refreshResult.data : {};
    const token = String(payload?.access_token || "").trim();
    if (!token) {
      clearAccessToken();
      logAuthTrace("refresh_fail_missing_token", {
        requestId: Number(meta?.requestId || 0),
      });
      return { ok: false, status: 500, error: "missing access_token" };
    }
    setAccessToken(token);
    logAuthTrace("refresh_ok", {
      requestId: Number(meta?.requestId || 0),
      status: Number(refreshResult.status || 0),
      waiters: refreshWaiters,
    });
    return { ok: true, status: Number(refreshResult.status || 0), access_token: token, token_type: "bearer" };
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function request(path, opts = {}) {
  const requestId = Number(opts.__requestId || (++requestSeq));
  const authAttempts = Number(opts.__authAttempts || 0);
  const endpoint = String(path || "");
  const method = String(opts.method || "GET").toUpperCase();
  const orgId = endpoint.startsWith("/api") && !AUTH_RETRY_BLOCKLIST.has(endpoint) && opts.auth !== false
    ? String(getActiveOrgId() || "").trim()
    : "";
  const res = await apiFetch({
    path: endpoint,
    method,
    headers: opts.headers,
    body: opts.body,
    signal: opts.signal,
    authToken: opts.auth !== false ? getAccessToken() : "",
    auth: opts.auth !== false,
    orgId,
    withOrgHeader: true,
  });

  if (
    res.status === 401
    && opts.auth !== false
    && opts.retryAuth !== false
    && !opts.__didRetryAuth
    && !AUTH_RETRY_BLOCKLIST.has(String(path || ""))
  ) {
    logAuthTrace("401", {
      requestId,
      path: String(path || ""),
      authAttempts,
      retryAuth: opts.retryAuth === false ? 0 : 1,
    });
    if (authAttempts >= 1) {
      logAuthTrace("401_abort_max_attempts", {
        requestId,
        path: String(path || ""),
      });
      emitAuthFailure("refresh_failed");
    } else {
      const refreshRes = await refreshAccessTokenLocked({
        requestId,
        reason: "response_401",
      });
      if (refreshRes?.ok) {
        logAuthTrace("retry_after_refresh", {
          requestId,
          path: String(path || ""),
          authAttempts: authAttempts + 1,
        });
        return request(path, {
          ...opts,
          __didRetryAuth: true,
          __authAttempts: authAttempts + 1,
          __requestId: requestId,
        });
      }
      logAuthTrace("refresh_chain_failed", {
        requestId,
        path: String(path || ""),
        status: Number(refreshRes?.status || 0),
      });
      emitAuthFailure("refresh_failed");
    }
  }
  if (!res.ok && Number(res?.status || 0) === 401) {
    logAuthTrace("401_final", {
      requestId,
      path: String(path || ""),
      didRetry: opts.__didRetryAuth ? 1 : 0,
      authAttempts,
    });
  }
  return res;
}

export async function apiRequest(path, opts = {}) {
  return request(path, opts);
}

export function shouldLogBpmnTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

export function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ------- Auth -------
export async function apiAuthLogin(email, password) {
  const body = {
    email: String(email || "").trim(),
    password: String(password || ""),
  };
  const r = okOrError(await request(apiRoutes.auth.login(), { method: "POST", body, auth: false, retryAuth: false }));
  if (!r.ok) return r;
  const token = String(r.data?.access_token || "").trim();
  if (!token) return { ok: false, status: r.status, error: "missing access_token" };
  setAccessToken(token);
  return { ok: true, status: r.status, access_token: token, token_type: "bearer" };
}

export async function apiAuthRefresh(options = {}) {
  const r = await refreshAccessTokenLocked();
  if (!r.ok && options?.silent !== true) emitAuthFailure("refresh_failed");
  return r;
}

export async function apiAuthInvitePreview(token) {
  const inviteToken = String(token || "").trim();
  if (!inviteToken) return { ok: false, status: 0, error: "missing token" };
  const r = okOrError(await request(apiRoutes.auth.invitePreview(), {
    method: "POST",
    auth: false,
    retryAuth: false,
    body: { token: inviteToken },
  }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    invite: r.data?.invite || {},
    identity: r.data?.identity || {},
    activation_allowed: Boolean(r.data?.activation_allowed),
  };
}

export async function apiInviteResolve(token) {
  return apiAuthInvitePreview(token);
}

export async function apiAuthInviteActivate({ token, password, password_confirm }) {
  const inviteToken = String(token || "").trim();
  const pwd = String(password || "");
  const pwdConfirm = String(password_confirm || "");
  if (!inviteToken) return { ok: false, status: 0, error: "missing token" };
  if (!pwd) return { ok: false, status: 0, error: "password_required" };
  const r = okOrError(await request(apiRoutes.auth.inviteActivate(), {
    method: "POST",
    auth: false,
    retryAuth: false,
    body: {
      token: inviteToken,
      password: pwd,
      password_confirm: pwdConfirm,
    },
  }));
  if (!r.ok) return r;
  const access = String(r.data?.access_token || "").trim();
  if (!access) return { ok: false, status: r.status, error: "missing access_token" };
  setAccessToken(access);
  return {
    ok: true,
    status: r.status,
    access_token: access,
    token_type: "bearer",
    invite: r.data?.invite || {},
    membership: r.data?.membership || {},
    user: r.data?.user || {},
  };
}

export async function apiInviteActivate(payload = {}) {
  return apiAuthInviteActivate(payload);
}

export async function apiAuthLogout() {
  const r = okOrError(await request(apiRoutes.auth.logout(), { method: "POST", auth: false, retryAuth: false }));
  clearAccessToken();
  return r.ok ? { ok: true, status: r.status, result: r.data || { ok: true } } : r;
}

export async function apiAuthMe() {
  const r = okOrError(await request(apiRoutes.auth.me(), { method: "GET", retryAuth: true }));
  if (!r.ok) return r;
  const orgs = Array.isArray(r.data?.orgs) ? r.data.orgs : [];
  const active_org_id = String(r.data?.active_org_id || r.data?.default_org_id || "").trim();
  const default_org_id = String(r.data?.default_org_id || "").trim();
  if (active_org_id) setActiveOrgId(active_org_id);
  return {
    ok: true,
    status: r.status,
    user: {
      id: String(r.data?.id || ""),
      email: String(r.data?.email || ""),
      is_admin: Boolean(r.data?.is_admin),
      active_org_id,
      default_org_id,
      orgs,
    },
  };
}
