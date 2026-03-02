// Single source of truth for API calls (FPC)
// Uses Vite proxy: /api -> backend, so API_BASE is empty.
function readApiBase() {
  const raw = String(import.meta?.env?.VITE_API_BASE || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

const API_BASE = readApiBase();
const ACCESS_TOKEN_KEY = "fpc_auth_access_token";
const AUTH_RETRY_BLOCKLIST = new Set(["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]);
const authFailureListeners = new Set();

let accessToken = "";
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

function joinUrl(path) {
  const p = String(path || "");
  if (!p) return API_BASE || "";
  if (/^https?:\/\//i.test(p)) return p;
  if (!API_BASE) return p;
  if (API_BASE.endsWith("/api") && p === "/api") return API_BASE;
  if (API_BASE.endsWith("/api") && p.startsWith("/api/")) return `${API_BASE}${p.slice(4)}`;
  if (p.startsWith("/")) return `${API_BASE}${p}`;
  return `${API_BASE}/${p}`;
}

function normalizeErrorPayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    if (payload.detail) return String(payload.detail);
    if (payload.message) return String(payload.message);
    if (payload.error) return String(payload.error);
    if (Array.isArray(payload.errors)) return payload.errors.map(String).join("; ");
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x) && !(x instanceof FormData) && !(x instanceof Blob);
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

export function onAuthFailure(listener) {
  if (typeof listener !== "function") return () => {};
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

async function fetchWithRawResponse(path, opts = {}) {
  const url = joinUrl(path);
  const method = String(opts.method || "GET").toUpperCase();
  const headers = new Headers(opts.headers || {});
  const hasBody = opts.body !== undefined && opts.body !== null;
  let body = opts.body;
  if (hasBody && isPlainObject(body)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return fetch(url, {
    method,
    headers,
    body: hasBody ? body : undefined,
    credentials: "include",
    signal: opts.signal,
  });
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
    let res;
    try {
      res = await fetch(joinUrl("/api/auth/refresh"), {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      clearAccessToken();
      return { ok: false, status: 0, error: String(e?.message || e || "network error") };
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      clearAccessToken();
      logAuthTrace("refresh_fail", {
        requestId: Number(meta?.requestId || 0),
        status: Number(res.status || 0),
      });
      return {
        ok: false,
        status: res.status,
        error: normalizeErrorPayload(payload) || `HTTP ${res.status}`,
      };
    }

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
      status: Number(res.status || 0),
      waiters: refreshWaiters,
    });
    return { ok: true, status: res.status, access_token: token, token_type: "bearer" };
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
  const method = String(opts.method || "GET").toUpperCase();
  const endpoint = String(path || "");
  const url = joinUrl(endpoint);
  let res;
  try {
    res = await fetchWithRawResponse(path, opts);
  } catch (e) {
    const aborted = !!opts?.signal?.aborted || String(e?.name || "").toLowerCase() === "aborterror";
    const errName = String(e?.name || "Error");
    const errMessage = String(e?.message || e || "network error");
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[API_NETWORK_ERROR]", {
        method,
        endpoint,
        url,
        err_name: errName,
        err_message: errMessage,
      });
    }
    return {
      ok: false,
      status: 0,
      error: errMessage,
      error_name: errName,
      error_message: errMessage,
      aborted,
      method,
      endpoint,
      url,
      request_url: url,
      request_method: method,
      response_text: "",
      data: null,
    };
  }

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

  const status = res.status;
  const ct = String(res.headers.get("content-type") || "");

  let data = null;
  let text = "";

  try {
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      text = await res.text();
    }
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    const err = normalizeErrorPayload(data) || text || `HTTP ${status}`;
    if (status === 401) {
      logAuthTrace("401_final", {
        requestId,
        path: String(path || ""),
        didRetry: opts.__didRetryAuth ? 1 : 0,
        authAttempts,
      });
    }
    return {
      ok: false,
      status,
      error: err,
      data,
      text,
      method,
      endpoint,
      url,
      response_text: text,
    };
  }

  return { ok: true, status, data, text, method, endpoint, url };
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
  const r = okOrError(await request("/api/auth/login", { method: "POST", body, auth: false, retryAuth: false }));
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
  const r = okOrError(await request("/api/auth/logout", { method: "POST", auth: false, retryAuth: false }));
  clearAccessToken();
  return r.ok ? { ok: true, status: r.status, result: r.data || { ok: true } } : r;
}

export async function apiAuthMe() {
  const r = okOrError(await request("/api/auth/me", { method: "GET", retryAuth: true }));
  if (!r.ok) return r;
  return {
    ok: true,
    status: r.status,
    user: {
      id: String(r.data?.id || ""),
      email: String(r.data?.email || ""),
      is_admin: Boolean(r.data?.is_admin),
    },
  };
}

// ------- Meta -------
export async function apiMeta() {
  const r = okOrError(await request("/api/meta"));
  return r.ok ? { ok: true, status: r.status, meta: r.data } : r;
}

// ------- Glossary -------
export async function apiGlossaryAdd(payload) {
  const r = okOrError(await request("/api/glossary/add", { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Projects -------
export async function apiListProjects() {
  const r = okOrError(await request("/api/projects"));
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

  const r = okOrError(await request("/api/projects", { method: "POST", body }));
  if (!r.ok) return r;

  const project_id = String(r.data?.id || r.data?.project_id || "").trim();
  return { ok: true, status: r.status, project_id, project: r.data };
}

export async function apiGetProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(id)}`));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPatchProject(projectId, patch) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPutProject(projectId, body) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiDeleteProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  return okOrError(await request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ------- Project Sessions -------
export async function apiListProjectSessions(projectId, mode) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const qs = m ? `?mode=${encodeURIComponent(m)}` : "";
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(pid)}/sessions${qs}`));
  const list = Array.isArray(r.data) ? r.data : [];
  return r.ok ? { ok: true, status: r.status, sessions: list } : r;
}

export async function apiCreateProjectSession(projectId, mode, title, roles, start_role, ai_prep_questions) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const qs = m ? `?mode=${encodeURIComponent(m)}` : "";
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

  const r = okOrError(await request(`/api/projects/${encodeURIComponent(pid)}/sessions${qs}`, { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

// ------- Sessions (legacy / fallback) -------
export async function apiListSessions() {
  const r = okOrError(await request("/api/sessions"));
  // backend returns {items, count}
  const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, sessions: list, count: Number(r.data?.count || list.length || 0) } : r;
}

export async function apiCreateSession(title, roles, start_role) {
  const t = String(title || "process").trim() || "process";
  const body = { title: t };
  if (roles !== undefined) body.roles = roles;
  if (start_role !== undefined) body.start_role = start_role;

  const r = okOrError(await request("/api/sessions", { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

export async function apiGetSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: patch || {} }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, session: r.data } : r;
}

export async function apiDeleteSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ------- Nodes -------
export async function apiCreateNode(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/nodes`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiPatchNode(sessionId, nodeId, patch) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/nodes/${encodeURIComponent(nid)}`, { method: "POST", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiDeleteNode(sessionId, nodeId) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  return okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/nodes/${encodeURIComponent(nid)}`, { method: "DELETE" }));
}

// ------- Edges -------
export async function apiCreateEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/edges`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, edge: r.data } : r;
}

export async function apiDeleteEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/edges`, { method: "DELETE", body: payload || {} }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/notes`, { method: "POST", body }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/answer`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiPostAnswers(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/answers`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiAiQuestions(sessionId, payload, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/ai/questions`, {
    method: "POST",
    body: payload || {},
    signal: options?.signal,
  }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiAiCommandOps(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/ai/ops`, { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
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

export async function apiCreatePathReportVersion(sessionId, pathId, payload) {
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const body = isPlainObject(payload) ? payload : {};
  const endpoints = [
    `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports`,
    `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports/`,
    `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports`,
    `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports/`,
    `/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports`,
    `/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports`,
  ];

  let last = null;
  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    const r = okOrError(await request(endpoint, { method: "POST", body }));
    if (r.ok) {
      const payloadError = reportPayloadErrorText(r?.data);
      const report = isPlainObject(r?.data?.report) ? r.data.report : {};
      const reportId = String(report?.id || "").trim();
      if (payloadError) {
        const marker = payloadError.toLowerCase();
        const errorStatus = marker.includes("not found") || marker.includes("not_found") || marker.includes("404")
          ? 404
          : marker.includes("unauthorized")
            ? 401
            : marker.includes("forbidden")
              ? 403
              : (marker.includes("required") || marker.includes("invalid") || marker.includes("missing"))
                ? 422
                : Number(r?.status || 400);
        return {
          ok: false,
          status: errorStatus,
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
    last = r;
    if (Number(r?.status || 0) === 404 && isPlainObject(r?.data) && r.data.error) return r;
    if (!isRetriablePathReportsStatus(r?.status)) return r;
  }
  if (last && !isRetriablePathReportsStatus(last?.status)) return last;
  return {
    ok: false,
    status: Number(last?.status || 404),
    error: "Path reports API endpoint is not available on current backend build",
    unsupported_endpoint: true,
    details: last,
  };
}

export async function apiListPathReportVersions(sessionId, pathId, options = {}) {
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const params = new URLSearchParams();
  const stepsHash = String(options?.stepsHash || "").trim();
  if (stepsHash) params.set("steps_hash", stepsHash);
  const qs = params.toString();
  const endpoints = [
    `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports${qs ? `?${qs}` : ""}`,
    `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports/${qs ? `?${qs}` : ""}`,
    `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports${qs ? `?${qs}` : ""}`,
    `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports/${qs ? `?${qs}` : ""}`,
    `/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports${qs ? `?${qs}` : ""}`,
    `/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports${qs ? `?${qs}` : ""}`,
  ];

  let last = null;
  for (let i = 0; i < endpoints.length; i += 1) {
    const r = okOrError(await request(endpoints[i], { signal: options?.signal }));
    if (r.ok) {
      const payloadError = reportPayloadErrorText(r?.data);
      if (payloadError) {
        const marker = payloadError.toLowerCase();
        const errorStatus = marker.includes("not found") || marker.includes("not_found") || marker.includes("404")
          ? 404
          : marker.includes("unauthorized")
            ? 401
            : marker.includes("forbidden")
              ? 403
              : (marker.includes("required") || marker.includes("invalid") || marker.includes("missing"))
                ? 422
                : Number(r?.status || 400);
        return {
          ok: false,
          status: errorStatus,
          error: payloadError,
          data: r?.data || null,
          method: r?.method,
          endpoint: r?.endpoint || endpoints[i],
          url: r?.url,
        };
      }
      const items = (Array.isArray(r.data) ? r.data : []).filter((row) => !isUnavailableSyntheticReport(row));
      return { ok: true, status: r.status, items };
    }
    last = r;
    if (Number(r?.status || 0) === 404 && isPlainObject(r?.data) && r.data.error) return r;
    if (!isRetriablePathReportsStatus(r?.status)) return r;
  }
  return last || { ok: false, status: 404, error: "not found" };
}

export async function apiGetReportVersion(reportId, options = {}) {
  const rid = String(reportId || "").trim();
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const sid = String(options?.sessionId || "").trim();
  const pid = String(options?.pathId || "").trim();
  const isNotFoundPayload = (payload) => {
    if (!isPlainObject(payload)) return false;
    const marker = String(payload?.detail || payload?.error || "").trim().toLowerCase();
    return marker === "not found" || marker.includes("not found");
  };
  const endpoints = [];
  if (sid && pid) {
    endpoints.push(
      `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports/${encodeURIComponent(rid)}`,
      `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports/${encodeURIComponent(rid)}/`,
      `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports/${encodeURIComponent(rid)}`,
      `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports/${encodeURIComponent(rid)}/`,
    );
  }
  endpoints.push(
    `/api/reports/${encodeURIComponent(rid)}`,
    `/api/reports/${encodeURIComponent(rid)}/`,
  );
  let last = null;
  for (let i = 0; i < endpoints.length; i += 1) {
    const r = await request(endpoints[i], { signal: options?.signal });
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
    if (
      Number(r?.status || 0) === 404
      || isNotFoundPayload(r?.data)
      || String(r?.error || "").trim().toLowerCase().includes("not found")
    ) {
      last = {
        ...r,
        ok: false,
        status: 404,
        error: String(r?.error || r?.data?.detail || r?.data?.error || "not found"),
      };
      continue;
    }
    last = r;
    if (!isRetriablePathReportsStatus(r?.status) && Number(r?.status || 0) !== 404) return r;
  }
  return last || { ok: false, status: 404, error: "not found" };
}


export async function apiDeleteReportVersion(reportId, options = {}) {
  const rid = String(reportId || "").trim();
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const sid = String(options?.sessionId || "").trim();
  const pid = String(options?.pathId || "").trim();

  const endpoints = [];
  if (sid && pid) {
    endpoints.push(
      `/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports/${encodeURIComponent(rid)}`,
      `/api/sessions/${encodeURIComponent(sid)}/path/${encodeURIComponent(pid)}/reports/${encodeURIComponent(rid)}`,
    );
  }
  endpoints.push(
    `/api/reports/${encodeURIComponent(rid)}`,
  );

  let last = null;
  for (let i = 0; i < endpoints.length; i += 1) {
    const r = okOrError(await request(endpoints[i], { method: "DELETE", signal: options?.signal }));
    if (r.ok) return { ok: true, status: r.status, result: r.data || null };
    last = r;
    const status = Number(r?.status || 0);
    if (status === 404) continue;
    if (status === 405) {
      return {
        ...r,
        ok: false,
        unsupported_endpoint: true,
        error: "Delete report endpoint is not available on current backend build",
      };
    }
    if (!isRetriablePathReportsStatus(status)) return r;
  }
  return last || { ok: false, status: 404, error: "not found" };
}

export async function apiSessionTitleQuestions(payload) {
  const body = isPlainObject(payload) ? payload : {};
  const title = String(body.title || "").trim();
  if (!title) return { ok: false, status: 0, error: "title is required" };
  const r = okOrError(await request("/api/llm/session-title/questions", { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Derived / Export / Analytics -------
export async function apiRecompute(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/recompute`, { method: "POST", body: {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetAnalytics(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/analytics`));
  return r.ok ? { ok: true, status: r.status, analytics: r.data } : r;
}

export async function apiGetBpmnXml(sessionId, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const params = new URLSearchParams();
  if (options?.raw === true) params.set("raw", "1");
  if (options?.includeOverlay === false) params.set("include_overlay", "0");
  if (options?.cacheBust === true) params.set("_ts", String(Date.now()));
  const qs = params.toString();
  const url = `/api/sessions/${encodeURIComponent(sid)}/bpmn${qs ? `?${qs}` : ""}`;
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn`, { method: "PUT", body, headers }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn`, { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetBpmnMeta(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn_meta`));
  return r.ok ? { ok: true, status: r.status, meta: r.data || { version: 1, flow_meta: {}, node_path_meta: {} } } : r;
}

export async function apiPatchBpmnMeta(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn_meta`, { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, meta: r.data || { version: 1, flow_meta: {}, node_path_meta: {} } } : r;
}

export async function apiInferBpmnRtiers(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn_meta/infer_rtiers`, { method: "POST", body }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/export`));
  return r.ok ? { ok: true, status: r.status, export: r.data } : r;
}

// ------- LLM Settings -------
export async function apiGetLlmSettings() {
  const r = okOrError(await request("/api/settings/llm"));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiPostLlmSettings(payload) {
  const r = okOrError(await request("/api/settings/llm", { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiVerifyLlmSettings(payload) {
  const r = okOrError(await request("/api/settings/llm/verify", { method: "POST", body: payload || {} }));
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
