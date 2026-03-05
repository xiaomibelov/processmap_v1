import { apiFetch, apiFetchWithFallback, isPlainObject, normalizeApiErrorPayload } from "./apiClient.js";
import { apiRoutes } from "./apiRoutes.js";

// Single source of truth for API calls (FPC)
const ACCESS_TOKEN_KEY = "fpc_auth_access_token";
const ACTIVE_ORG_KEY = "fpc_active_org_id";
const AUTH_RETRY_BLOCKLIST = new Set([
  apiRoutes.auth.login(),
  apiRoutes.auth.refresh(),
  apiRoutes.auth.logout(),
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

function normalizeNotes(value) {
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

function okOrError(r) {
  if (!r.ok) return r;
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data) && (r.data.error || r.data.detail)) {
    const errText = String(r.data.error || r.data.detail || "");
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

function shouldLogBpmnTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function fnv1aHex(input) {
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

export async function apiListOrgs() {
  const r = okOrError(await request(apiRoutes.orgs.list(), { method: "GET", retryAuth: true }));
  if (!r.ok) return r;
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  const active_org_id = String(r.data?.active_org_id || "").trim();
  const default_org_id = String(r.data?.default_org_id || "").trim();
  if (active_org_id) setActiveOrgId(active_org_id);
  return { ok: true, status: r.status, items, active_org_id, default_org_id };
}

// ------- Templates -------
export async function apiListTemplates({ scope = "personal", orgId = "", limit = 200 } = {}) {
  const normalizedScope = String(scope || "").trim().toLowerCase() === "org" ? "org" : "personal";
  const oid = String(orgId || "").trim();
  const endpoint = (() => {
    const base = apiRoutes.templates.list(normalizedScope, oid);
    if (Number(limit || 0) <= 0) return base;
    const cap = String(Math.max(1, Math.min(1000, Number(limit || 200))));
    return `${base}${base.includes("?") ? "&" : "?"}limit=${encodeURIComponent(cap)}`;
  })();
  const r = okOrError(await request(endpoint, { method: "GET" }));
  if (!r.ok) return r;
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  return {
    ok: true,
    status: r.status,
    scope: String(r.data?.scope || normalizedScope),
    org_id: String(r.data?.org_id || oid),
    count: Number(r.data?.count || items.length || 0),
    items,
  };
}

export async function apiCreateTemplate(payload = {}) {
  const body = {
    scope: String(payload?.scope || "personal"),
    org_id: String(payload?.org_id || payload?.orgId || ""),
    name: String(payload?.name || ""),
    description: String(payload?.description || ""),
    payload: payload?.payload && typeof payload.payload === "object" ? payload.payload : {},
  };
  const r = okOrError(await request(apiRoutes.templates.create(), { method: "POST", body }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    item: r.data?.item || {},
  };
}

export async function apiPatchTemplate(templateId, patch = {}) {
  const tid = String(templateId || "").trim();
  if (!tid) return { ok: false, status: 0, error: "missing template_id" };
  const body = {};
  if (patch && Object.prototype.hasOwnProperty.call(patch, "name")) body.name = String(patch.name || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "description")) body.description = String(patch.description || "");
  if (patch && Object.prototype.hasOwnProperty.call(patch, "payload")) body.payload = patch.payload && typeof patch.payload === "object" ? patch.payload : {};
  const r = okOrError(await request(apiRoutes.templates.item(tid), { method: "PATCH", body }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    item: r.data?.item || {},
  };
}

export async function apiDeleteTemplate(templateId) {
  const tid = String(templateId || "").trim();
  if (!tid) return { ok: false, status: 0, error: "missing template_id" };
  const r = okOrError(await request(apiRoutes.templates.item(tid), { method: "DELETE" }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
  };
}

// ------- Enterprise Org Settings -------
export async function apiListOrgMembers(orgId) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.members(oid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiPatchOrgMember(orgId, userId, role) {
  const oid = String(orgId || "").trim();
  const uid = String(userId || "").trim();
  const nextRole = String(role || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  if (!nextRole) return { ok: false, status: 0, error: "missing role" };
  const endpoint = apiRoutes.orgs.member(oid, uid);
  const r = okOrError(await request(endpoint, { method: "PATCH", body: { role: nextRole } }));
  return r.ok ? { ok: true, status: r.status, item: r.data || {} } : r;
}

export async function apiListOrgInvites(orgId) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.invites(oid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiCreateOrgInvite(orgId, payload = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const endpoint = apiRoutes.orgs.invites(oid);
  const body = {
    email: String(payload?.email || "").trim(),
    role: String(payload?.role || "").trim(),
    ttl_days: Number(payload?.ttl_days || payload?.ttlDays || 7),
  };
  const r = okOrError(await request(endpoint, { method: "POST", body }));
  return r.ok
    ? {
      ok: true,
      status: r.status,
      invite: r.data?.invite || {},
      invite_token: r.data?.invite_token || "",
      invite_link: r.data?.invite_link || "",
      delivery: String(r.data?.delivery || ""),
    }
    : r;
}

export async function apiAcceptInviteToken(token) {
  const inviteToken = String(token || "").trim();
  if (!inviteToken) return { ok: false, status: 0, error: "missing token" };
  const r = okOrError(await request(apiRoutes.misc.inviteAccept(), { method: "POST", body: { token: inviteToken } }));
  return r.ok ? { ok: true, status: r.status, invite: r.data?.invite || {}, membership: r.data?.membership || {} } : r;
}

export async function apiRevokeOrgInvite(orgId, inviteId) {
  const oid = String(orgId || "").trim();
  const iid = String(inviteId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!iid) return { ok: false, status: 0, error: "missing invite_id" };
  const endpoint = apiRoutes.orgs.inviteRevoke(oid, iid);
  const r = okOrError(await request(endpoint, { method: "POST" }));
  return r.ok ? { ok: true, status: r.status } : r;
}

export async function apiCleanupOrgInvites(orgId, keepDays) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const n = Number(keepDays || 0);
  const endpoint = apiRoutes.orgs.invitesCleanup(
    oid,
    Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "",
  );
  const r = okOrError(await request(endpoint, { method: "POST" }));
  return r.ok ? { ok: true, status: r.status, deleted: Number(r.data?.deleted || 0) } : r;
}

export async function apiListOrgAudit(orgId, query = {}) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const params = new URLSearchParams();
  const limit = Number(query?.limit || 100);
  if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.min(500, Math.max(1, Math.round(limit)))));
  const action = String(query?.action || "").trim();
  const projectId = String(query?.project_id || query?.projectId || "").trim();
  const sessionId = String(query?.session_id || query?.sessionId || "").trim();
  const status = String(query?.status || "").trim();
  if (action) params.set("action", action);
  if (projectId) params.set("project_id", projectId);
  if (sessionId) params.set("session_id", sessionId);
  if (status) params.set("status", status);
  const endpoint = apiRoutes.orgs.audit(oid) + (params.toString() ? `?${params.toString()}` : "");
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiCleanupOrgAudit(orgId, retentionDays) {
  const oid = String(orgId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const n = Number(retentionDays || 0);
  const endpoint = apiRoutes.orgs.auditCleanup(
    oid,
    Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "",
  );
  const r = okOrError(await request(endpoint, { method: "POST" }));
  return r.ok ? { ok: true, status: r.status, deleted: Number(r.data?.deleted || 0) } : r;
}

export async function apiGetEnterpriseWorkspace(options = {}) {
  const explicitOrgId = String(options?.orgId || "").trim();
  const active = String(getActiveOrgId() || "").trim();
  const oid = explicitOrgId || active;
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  const params = new URLSearchParams();
  const groupBy = String(options?.groupBy || "").trim().toLowerCase();
  if (groupBy === "users" || groupBy === "projects") params.set("group_by", groupBy);
  const q = String(options?.q || "").trim();
  if (q) params.set("q", q);
  const ownerIds = Array.isArray(options?.ownerIds)
    ? options.ownerIds
    : String(options?.ownerIds || "").split(",");
  const ownerList = ownerIds
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (ownerList.length) params.set("owner_ids", ownerList.join(","));
  const projectId = String(options?.projectId || "").trim();
  if (projectId) params.set("project_id", projectId);
  const status = String(options?.status || "").trim().toLowerCase();
  if (status) params.set("status", status);
  const updatedFrom = Number(options?.updatedFrom || 0);
  if (Number.isFinite(updatedFrom) && updatedFrom > 0) params.set("updated_from", String(Math.round(updatedFrom)));
  const updatedTo = Number(options?.updatedTo || 0);
  if (Number.isFinite(updatedTo) && updatedTo > 0) params.set("updated_to", String(Math.round(updatedTo)));
  if (options?.needsAttention === true || options?.needsAttention === 1) params.set("needs_attention", "1");
  if (options?.needsAttention === false || options?.needsAttention === 0) params.set("needs_attention", "0");
  const limit = Number(options?.limit || 50);
  if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.min(200, Math.max(1, Math.round(limit)))));
  const offset = Number(options?.offset || 0);
  if (Number.isFinite(offset) && offset >= 0) params.set("offset", String(Math.max(0, Math.round(offset))));
  const endpoint = apiRoutes.enterprise.workspace(Object.fromEntries(params.entries()));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    org: isPlainObject(data.org) ? data.org : {},
    group_by: String(data.group_by || groupBy || "users"),
    users: Array.isArray(data.users) ? data.users : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    page: isPlainObject(data.page) ? data.page : { limit: 50, offset: 0, total: 0 },
  };
}

// ------- Meta -------
export async function apiMeta() {
  const r = okOrError(await request(apiRoutes.misc.meta()));
  return r.ok ? { ok: true, status: r.status, meta: r.data } : r;
}

// ------- Glossary -------
export async function apiGlossaryAdd(payload) {
  const r = okOrError(await request(apiRoutes.misc.glossaryAdd(), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Projects -------
export async function apiListProjects() {
  const r = okOrError(await request(apiRoutes.projects.list()));
  const list = Array.isArray(r.data) ? r.data : [];
  return r.ok ? { ok: true, status: r.status, projects: list, items: list } : r;
}

function normalizeCreateProjectPayload(payload) {
  // Backend expects CreateProjectIn: { title: string, passport?: object }
  if (typeof payload === "string") {
    const title = payload.trim();
    return { title, passport: {} };
  }
  if (isPlainObject(payload)) {
    const title = String(payload.title || payload.name || payload.project_title || payload.projectTitle || "").trim();
    const passportRaw = payload.passport ?? payload.process_passport ?? payload.processPassport ?? {};
    const passport = isPlainObject(passportRaw) ? passportRaw : {};
    const out = { ...payload, title, passport };
    delete out.name;
    delete out.project_title;
    delete out.projectTitle;
    delete out.process_passport;
    delete out.processPassport;
    return out;
  }
  return { title: "", passport: {} };
}

export async function apiCreateProject(payload) {
  const body = normalizeCreateProjectPayload(payload);
  if (!String(body.title || "").trim()) {
    return { ok: false, status: 0, error: "project title required" };
  }

  const r = okOrError(await request(apiRoutes.projects.create(), { method: "POST", body }));
  if (!r.ok) return r;

  const project_id = String(r.data?.id || r.data?.project_id || "").trim();
  return { ok: true, status: r.status, project_id, project: r.data };
}

export async function apiGetProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.projects.item(id)));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPatchProject(projectId, patch) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.projects.item(id), { method: "PATCH", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPutProject(projectId, body) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.projects.item(id), { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiDeleteProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  return okOrError(await request(apiRoutes.projects.item(id), { method: "DELETE" }));
}

// ------- Project Sessions -------
export async function apiListProjectSessions(projectId, mode) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const r = okOrError(await request(apiRoutes.projects.sessions(pid, m)));
  const list = Array.isArray(r.data) ? r.data : [];
  return r.ok ? { ok: true, status: r.status, sessions: list } : r;
}

export async function apiCreateProjectSession(projectId, mode, title, roles, start_role, ai_prep_questions) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const t = String(title || "process").trim() || "process";
  const roleList = Array.isArray(roles) ? roles : undefined;
  const startRole = start_role === undefined ? undefined : String(start_role || "").trim();

  // backend expects CreateSessionIn: { title: string, roles?: any, start_role?: string }
  const body = { title: t };
  if (roleList !== undefined) body.roles = roleList;
  if (startRole !== undefined) body.start_role = startRole;
  if (Array.isArray(ai_prep_questions)) {
    body.ai_prep_questions = ai_prep_questions;
  }

  const r = okOrError(await request(apiRoutes.projects.sessions(pid, m), { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

// ------- Enterprise Project Members -------
export async function apiListOrgProjectMembers(orgId, projectId) {
  const oid = String(orgId || "").trim();
  const pid = String(projectId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  const endpoint = apiRoutes.orgs.projectMembers(oid, pid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiUpsertOrgProjectMember(orgId, projectId, userId, role, options = {}) {
  const oid = String(orgId || "").trim();
  const pid = String(projectId || "").trim();
  const uid = String(userId || "").trim();
  const nextRole = String(role || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  if (!nextRole) return { ok: false, status: 0, error: "missing role" };
  const usePatch = options?.patch === true;
  const endpoint = usePatch
    ? apiRoutes.orgs.projectMember(oid, pid, uid)
    : apiRoutes.orgs.projectMembers(oid, pid);
  const body = usePatch ? { role: nextRole } : { user_id: uid, role: nextRole };
  const method = usePatch ? "PATCH" : "POST";
  const r = okOrError(await request(endpoint, { method, body }));
  return r.ok ? { ok: true, status: r.status, item: r.data || {} } : r;
}

export async function apiDeleteOrgProjectMember(orgId, projectId, userId) {
  const oid = String(orgId || "").trim();
  const pid = String(projectId || "").trim();
  const uid = String(userId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  const endpoint = apiRoutes.orgs.projectMember(oid, pid, uid);
  const r = okOrError(await request(endpoint, { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status, result: r.data || null } : r;
}

// ------- Sessions (legacy / fallback) -------
export async function apiListSessions() {
  const r = okOrError(await request(apiRoutes.sessions.list()));
  // backend returns {items, count}
  const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, sessions: list, count: Number(r.data?.count || list.length || 0) } : r;
}

export async function apiCreateSession(title, roles, start_role) {
  const t = String(title || "process").trim() || "process";
  const body = { title: t };
  if (roles !== undefined) body.roles = roles;
  if (start_role !== undefined) body.start_role = start_role;

  const r = okOrError(await request(apiRoutes.sessions.create(), { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

export async function apiGetSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.item(id)));
  if (r.ok && r.data && typeof r.data === "object" && String(r.data.error || "").trim()) {
    const detail = String(r.data.error || "not found").trim() || "not found";
    return { ok: false, status: 404, error: detail, data: r.data };
  }
  return r.ok
    ? {
        ok: true,
        status: r.status,
        session: {
          ...(r.data && typeof r.data === "object" ? r.data : {}),
          _sync_source: "get_session",
        },
      }
    : r;
}

export async function apiPatchSession(sessionId, patch) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const patchKeys = patch && typeof patch === "object" ? Object.keys(patch) : [];
  if (shouldLogBpmnTrace()) {
    // eslint-disable-next-line no-console
    console.debug(`[PATCH_SESSION] start sid=${id} payloadKeys=${patchKeys.join(",") || "-"}`);
  }
  const r = okOrError(await request(apiRoutes.sessions.item(id), { method: "PATCH", body: patch || {} }));
  if (shouldLogBpmnTrace()) {
    const xml = String(r?.data?.bpmn_xml || "");
    // eslint-disable-next-line no-console
    console.debug(
      `[PATCH_SESSION] done sid=${id} status=${Number(r?.status || 0)} ok=${r.ok ? 1 : 0} `
      + `resp.bpmn_xml.len=${xml.length} respHash=${fnv1aHex(xml)}`,
    );
  }
  return r.ok
    ? {
        ok: true,
        status: r.status,
        session: {
          ...(r.data && typeof r.data === "object" ? r.data : {}),
          _sync_source: "patch_session",
          _patch_payload_keys: patchKeys,
        },
      }
    : r;
}

export async function apiPutSession(sessionId, body) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.item(id), { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, session: r.data } : r;
}

export async function apiDeleteSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.item(id), { method: "DELETE" }));
}

// ------- Nodes -------
export async function apiCreateNode(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.nodes(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiPatchNode(sessionId, nodeId, patch) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  const r = okOrError(await request(apiRoutes.sessions.node(sid, nid), { method: "POST", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiDeleteNode(sessionId, nodeId) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  return okOrError(await request(apiRoutes.sessions.node(sid, nid), { method: "DELETE" }));
}

// ------- Edges -------
export async function apiCreateEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.edges(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, edge: r.data } : r;
}

export async function apiDeleteEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.edges(sid), { method: "DELETE", body: payload || {} }));
}

// ------- Notes / Answers / AI -------
export async function apiPostNote(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  let body = payload;
  if (typeof payload === "string") {
    body = { notes: payload };
  } else if (!isPlainObject(payload)) {
    body = {};
  }
  const r = okOrError(await request(apiRoutes.sessions.notes(sid), { method: "POST", body }));
  if (!r.ok) return r;
  const session = isPlainObject(r.data) ? { ...r.data } : r.data;
  if (isPlainObject(session) && "notes" in session) {
    session.notes = normalizeNotes(session.notes);
  }
  return { ok: true, status: r.status, session, result: session };
}

export async function apiPostAnswer(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.answer(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiPostAnswers(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.answers(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiAiQuestions(sessionId, payload, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.aiQuestions(sid), {
    method: "POST",
    body: payload || {},
    signal: options?.signal,
  }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

function resolveReportOrgId(options = {}) {
  const explicit = String(options?.orgId || "").trim();
  if (explicit) return explicit;
  return String(getActiveOrgId() || "").trim();
}

export async function apiBuildOrgReport(orgId, sessionId, pathId, payload, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const body = isPlainObject(payload) ? { ...payload, path_id: pid } : { path_id: pid };
  const endpoint = apiRoutes.orgs.reportBuild(oid, sid);
  const r = okOrError(await request(endpoint, { method: "POST", body, signal: options?.signal }));
  if (!r.ok) return r;
  const report = isPlainObject(r?.data?.report) ? r.data.report : {};
  const reportId = String(report?.id || "").trim();
  if (!reportId) {
    return {
      ok: false,
      status: Number(r?.status || 502),
      error: "Malformed report create response: missing report.id",
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  return { ok: true, status: r.status, report, result: r.data };
}

export async function apiListOrgReportVersions(orgId, sessionId, pathId, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const endpoint = apiRoutes.orgs.reportVersions(oid, sid, pid, options?.stepsHash || "");
  const r = okOrError(await request(endpoint, { signal: options?.signal }));
  if (!r.ok) return r;
  const items = (Array.isArray(r.data) ? r.data : []).filter((row) => !isUnavailableSyntheticReport(row));
  return { ok: true, status: r.status, items };
}

export async function apiGetOrgReportVersion(orgId, sessionId, reportId, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const rid = String(reportId || "").trim();
  const pid = String(options?.pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const endpoint = apiRoutes.orgs.reportVersion(oid, sid, rid, pid, options?.stepsHash || "");
  const r = okOrError(await request(endpoint, { signal: options?.signal }));
  if (!r.ok) return r;
  return { ok: true, status: r.status, report: r.data || {} };
}

export async function apiDeleteOrgReportVersion(orgId, sessionId, reportId, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const rid = String(reportId || "").trim();
  const pid = String(options?.pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const endpoint = apiRoutes.orgs.reportVersion(oid, sid, rid, pid, options?.stepsHash || "");
  const r = okOrError(await request(endpoint, { method: "DELETE", signal: options?.signal }));
  return r.ok ? { ok: true, status: r.status, result: r.data || null } : r;
}

function isUnavailableSyntheticReport(rowRaw) {
  const row = isPlainObject(rowRaw) ? rowRaw : {};
  const rid = String(row?.id || "").trim().toLowerCase();
  const model = String(row?.model || "").trim().toLowerCase();
  const error = String(row?.error || row?.error_message || "").trim().toLowerCase();
  return rid.startsWith("rpt_local_")
    || model === "unavailable"
    || error.includes("path reports api endpoint is not available");
}

function isRetriablePathReportsStatus(statusRaw) {
  const status = Number(statusRaw || 0);
  return status === 0 || status === 404 || status === 405 || status === 502 || status === 503 || status === 504;
}

function reportPayloadErrorText(payloadRaw) {
  const payload = isPlainObject(payloadRaw) ? payloadRaw : {};
  return String(payload?.error || payload?.detail || payload?.message || "").trim();
}

function reportPayloadErrorStatus(payloadError, fallbackStatus = 400) {
  const marker = String(payloadError || "").toLowerCase();
  if (!marker) return Number(fallbackStatus || 400);
  if (marker.includes("not found") || marker.includes("not_found") || marker.includes("404")) return 404;
  if (marker.includes("unauthorized")) return 401;
  if (marker.includes("forbidden")) return 403;
  if (marker.includes("required") || marker.includes("invalid") || marker.includes("missing")) return 422;
  return Number(fallbackStatus || 400);
}

async function pathReportsFallbackFetch({
  op,
  primaryPath,
  fallbackPath,
  method = "GET",
  body,
  signal,
}) {
  return apiFetchWithFallback({
    op,
    primaryPath,
    fallbackPath,
    method,
    body,
    signal,
    authToken: getAccessToken(),
    orgId: getActiveOrgId(),
    withOrgHeader: true,
    fallbackStatuses: [404, 405],
  });
}

export async function apiCreatePathReportVersion(sessionId, pathId, payload) {
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const body = isPlainObject(payload) ? payload : {};
  const orgId = resolveReportOrgId();
  let last = null;
  if (orgId) {
    const enterprise = await apiBuildOrgReport(orgId, sid, pid, body);
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }
  const endpoint = apiRoutes.sessions.pathReports(sid, pid);
  const fallbackEndpoint = apiRoutes.sessions.pathReportsLegacy(sid, pid);
  const r = okOrError(await pathReportsFallbackFetch({
    op: "apiCreatePathReportVersion",
    primaryPath: endpoint,
    fallbackPath: fallbackEndpoint,
    method: "POST",
    body,
  }));
  if (!r.ok) {
    if (last && !isRetriablePathReportsStatus(r?.status)) return r;
    return last && !last.ok ? last : r;
  }
  const payloadError = reportPayloadErrorText(r?.data);
  const report = isPlainObject(r?.data?.report) ? r.data.report : {};
  const reportId = String(report?.id || "").trim();
  if (payloadError) {
    return {
      ok: false,
      status: reportPayloadErrorStatus(payloadError, r?.status),
      error: payloadError,
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  if (!reportId) {
    return {
      ok: false,
      status: Number(r?.status || 502),
      error: "Malformed report create response: missing report.id",
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  return { ok: true, status: r.status, report, result: r.data };
}

export async function apiListPathReportVersions(sessionId, pathId, options = {}) {
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const orgId = resolveReportOrgId(options);
  let last = null;
  if (orgId) {
    const enterprise = await apiListOrgReportVersions(orgId, sid, pid, options);
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }
  const stepsHash = String(options?.stepsHash || "").trim();
  const endpoint = apiRoutes.sessions.pathReports(sid, pid, stepsHash);
  const fallbackEndpoint = apiRoutes.sessions.pathReportsLegacy(sid, pid, stepsHash);
  const r = okOrError(await pathReportsFallbackFetch({
    op: "apiListPathReportVersions",
    primaryPath: endpoint,
    fallbackPath: fallbackEndpoint,
    method: "GET",
    signal: options?.signal,
  }));
  if (!r.ok) return last && !last.ok ? last : r;
  const payloadError = reportPayloadErrorText(r?.data);
  if (payloadError) {
    return {
      ok: false,
      status: reportPayloadErrorStatus(payloadError, r?.status),
      error: payloadError,
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  const items = (Array.isArray(r.data) ? r.data : []).filter((row) => !isUnavailableSyntheticReport(row));
  return { ok: true, status: r.status, items };
}

export async function apiGetReportVersion(reportId, options = {}) {
  const rid = String(reportId || "").trim();
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const sid = String(options?.sessionId || "").trim();
  const pid = String(options?.pathId || "").trim();
  const orgId = resolveReportOrgId(options);
  const isNotFoundPayload = (payload) => {
    if (!isPlainObject(payload)) return false;
    const marker = String(payload?.detail || payload?.error || "").trim().toLowerCase();
    return marker === "not found" || marker.includes("not found");
  };
  let last = null;
  if (orgId && sid) {
    const enterprise = await apiGetOrgReportVersion(orgId, sid, rid, { ...options, pathId: pid });
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }
  if (sid && pid) {
    const scoped = await okOrError(await pathReportsFallbackFetch({
      op: "apiGetReportVersion",
      primaryPath: apiRoutes.sessions.pathReport(sid, pid, rid),
      fallbackPath: apiRoutes.sessions.pathReportLegacy(sid, pid, rid),
      method: "GET",
      signal: options?.signal,
    }));
    if (scoped.ok) {
      if (isNotFoundPayload(scoped?.data)) {
        return {
          ok: false,
          status: 404,
          error: String(scoped?.data?.detail || scoped?.data?.error || "not found"),
          data: scoped?.data || null,
          method: scoped?.method,
          endpoint: scoped?.endpoint,
          url: scoped?.url,
          response_text: scoped?.response_text,
          text: scoped?.text,
        };
      }
      return { ok: true, status: scoped.status, report: scoped.data || {} };
    }
    const scopedStatus = Number(scoped?.status || 0);
    if (scopedStatus !== 404 && !isRetriablePathReportsStatus(scopedStatus)) return scoped;
    last = scoped;
  }
  const r = await request(apiRoutes.reports.item(rid), { signal: options?.signal });
  if (r.ok) {
    if (isNotFoundPayload(r?.data)) {
      return {
        ok: false,
        status: 404,
        error: String(r?.data?.detail || r?.data?.error || "not found"),
        data: r?.data || null,
        method: r?.method,
        endpoint: r?.endpoint,
        url: r?.url,
        response_text: r?.response_text,
        text: r?.text,
      };
    }
    return { ok: true, status: r.status, report: r.data || {} };
  }
  if (Number(r?.status || 0) === 404 || isNotFoundPayload(r?.data) || String(r?.error || "").trim().toLowerCase().includes("not found")) {
    return {
      ...r,
      ok: false,
      status: 404,
      error: String(r?.error || r?.data?.detail || r?.data?.error || "not found"),
    };
  }
  last = r;
  if (!isRetriablePathReportsStatus(r?.status) && Number(r?.status || 0) !== 404) return r;
  return last || { ok: false, status: 404, error: "not found" };
}


export async function apiDeleteReportVersion(reportId, options = {}) {
  const rid = String(reportId || "").trim();
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const sid = String(options?.sessionId || "").trim();
  const pid = String(options?.pathId || "").trim();
  const orgId = resolveReportOrgId(options);
  let last = null;
  if (orgId && sid) {
    const enterprise = await apiDeleteOrgReportVersion(orgId, sid, rid, { ...options, pathId: pid });
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }

  if (sid && pid) {
    const scoped = okOrError(await pathReportsFallbackFetch({
      op: "apiDeleteReportVersion",
      primaryPath: apiRoutes.sessions.pathReport(sid, pid, rid),
      fallbackPath: apiRoutes.sessions.pathReportLegacy(sid, pid, rid),
      method: "DELETE",
      signal: options?.signal,
    }));
    if (scoped.ok) return { ok: true, status: scoped.status, result: scoped.data || null };
    last = scoped;
    const scopedStatus = Number(scoped?.status || 0);
    if (scopedStatus === 405) {
      return {
        ...scoped,
        ok: false,
        unsupported_endpoint: true,
        error: "Delete report endpoint is not available on current backend build",
      };
    }
    if (scopedStatus !== 404 && !isRetriablePathReportsStatus(scopedStatus)) return scoped;
  }
  const r = okOrError(await request(apiRoutes.reports.item(rid), { method: "DELETE", signal: options?.signal }));
  if (r.ok) return { ok: true, status: r.status, result: r.data || null };
  last = r;
  const status = Number(r?.status || 0);
  if (status === 405) {
    return {
      ...r,
      ok: false,
      unsupported_endpoint: true,
      error: "Delete report endpoint is not available on current backend build",
    };
  }
  if (!isRetriablePathReportsStatus(status)) return r;
  return last || { ok: false, status: 404, error: "not found" };
}

export async function apiSessionTitleQuestions(payload) {
  const body = isPlainObject(payload) ? payload : {};
  const title = String(body.title || "").trim();
  if (!title) return { ok: false, status: 0, error: "title is required" };
  const r = okOrError(await request(apiRoutes.llm.sessionTitleQuestions(), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Derived / Export / Analytics -------
export async function apiRecompute(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.recompute(sid), { method: "POST", body: {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetAnalytics(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.analytics(sid)));
  return r.ok ? { ok: true, status: r.status, analytics: r.data } : r;
}

export async function apiGetBpmnXml(sessionId, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const url = apiRoutes.sessions.bpmn(sid, options);
  const r = okOrError(await request(url));
  return r.ok ? { ok: true, status: r.status, xml: r.text || "" } : r;
}

export async function apiPutBpmnXml(sessionId, xml, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = { xml: String(xml || "") };
  const rev = Number(options?.rev);
  if (Number.isFinite(rev) && rev >= 0) {
    body.rev = rev;
  }
  const headers = {};
  if (options?.ifMatch !== undefined && options?.ifMatch !== null) {
    headers["If-Match"] = String(options.ifMatch);
  }
  const r = okOrError(await request(apiRoutes.sessions.bpmn(sid), { method: "PUT", body, headers }));
  if (!r.ok) return r;
  const storedRev = Number(r?.data?.version);
  return {
    ok: true,
    status: r.status,
    result: r.data,
    storedRev: Number.isFinite(storedRev) ? storedRev : (Number.isFinite(rev) ? rev : 0),
  };
}

export async function apiDeleteBpmnXml(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.bpmn(sid), { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetBpmnMeta(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.bpmnMeta(sid)));
  return r.ok ? { ok: true, status: r.status, meta: r.data || { version: 1, flow_meta: {}, node_path_meta: {} } } : r;
}

export async function apiPatchBpmnMeta(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(apiRoutes.sessions.bpmnMeta(sid), { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, meta: r.data || { version: 1, flow_meta: {}, node_path_meta: {} } } : r;
}

export async function apiInferBpmnRtiers(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(apiRoutes.sessions.inferRtiers(sid), { method: "POST", body }));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    meta: data.meta || { version: 1, flow_meta: {}, node_path_meta: {} },
    inference: data.inference || {},
  };
}

export async function apiGetExport(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.export(sid)));
  return r.ok ? { ok: true, status: r.status, export: r.data } : r;
}

// ------- LLM Settings -------
export async function apiGetLlmSettings() {
  const r = okOrError(await request(apiRoutes.llm.settings()));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiPostLlmSettings(payload) {
  const r = okOrError(await request(apiRoutes.llm.settings(), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiVerifyLlmSettings(payload) {
  const r = okOrError(await request(apiRoutes.llm.verify(), { method: "POST", body: payload || {} }));
  if (!r.ok && Number(r.status) === 404) {
    return {
      ok: false,
      status: 404,
      error: "Endpoint /api/settings/llm/verify не найден. Перезапустите backend с последними изменениями.",
      needs_backend_restart: true,
    };
  }
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- DEV helpers -------
export async function apiWipeDevAll() {
  const lp = await apiListProjects();
  if (!lp.ok) return lp;

  const projects = Array.isArray(lp.projects) ? lp.projects : Array.isArray(lp.items) ? lp.items : [];
  let deleted = 0;

  for (const p of projects) {
    const id = String((p && (p.id || p.project_id)) || "").trim();
    if (!id) continue;
    const r = await apiDeleteProject(id);
    if (!r.ok) return r;
    deleted += 1;
  }

  return { ok: true, status: 200, deleted };
}
