import { apiRoutes } from "../../lib/apiRoutes.js";
import { joinUrl } from "../../lib/apiClient.js";

const ACCESS_TOKEN_KEY = "fpc_auth_access_token";
const ACTIVE_ORG_KEY = "fpc_active_org_id";
const TAB_ID_KEY = "fpc_runtime_tab_id_v1";
const APP_VERSION = String(import.meta?.env?.VITE_APP_VERSION || "0.0.0").trim() || "0.0.0";
const GIT_SHA = String(import.meta?.env?.VITE_GIT_SHA || "").trim() || null;
const SCHEMA_VERSION = 1;
const THROTTLE_MS = 8000;
const MAX_TEXT = 2000;
const MAX_ROUTE = 512;
const MAX_STACK = 4000;
const MAX_KEYS = 40;
const MAX_LIST = 20;
const REDACTED = "[REDACTED]";
const TELEMETRY_PATH = apiRoutes.misc.telemetryErrorEvents();
const recentFingerprints = new Map();
const debugState = {
  emitted: [],
  accepted: [],
  failures: [],
};

let userContext = { userId: "", orgId: "" };
let listenersInstalled = false;
let telemetrySendDepth = 0;
const runtimeId = createOpaqueId("rt");
let memoryTabId = "";

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function createOpaqueId(prefix = "id") {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    }
  } catch {
    // ignore crypto failures
  }
  return `${prefix}_${Math.random().toString(16).slice(2, 14)}`;
}

function normalizeText(value, maxLen = MAX_TEXT) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...[truncated]`;
}

function readStorageItem(storage, key) {
  try {
    return String(storage?.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function writeStorageItem(storage, key, value) {
  try {
    storage?.setItem(key, String(value || ""));
  } catch {
    // ignore storage errors
  }
}

function currentWindow() {
  return typeof window !== "undefined" ? window : undefined;
}

function getTabId() {
  const win = currentWindow();
  if (!win) return memoryTabId || (memoryTabId = createOpaqueId("tab"));
  const existing = readStorageItem(win.sessionStorage, TAB_ID_KEY);
  if (existing) {
    memoryTabId = existing;
    return existing;
  }
  const next = memoryTabId || createOpaqueId("tab");
  memoryTabId = next;
  writeStorageItem(win.sessionStorage, TAB_ID_KEY, next);
  return next;
}

function readAccessToken() {
  const win = currentWindow();
  if (!win) return "";
  return readStorageItem(win.localStorage, ACCESS_TOKEN_KEY);
}

function readStoredOrgId() {
  const win = currentWindow();
  if (!win) return "";
  return readStorageItem(win.localStorage, ACTIVE_ORG_KEY);
}

function readRouteContext() {
  const win = currentWindow();
  if (!win) {
    return {
      route: "",
      projectId: "",
      sessionId: "",
    };
  }
  try {
    const url = new URL(win.location.href);
    return {
      route: normalizeText(`${url.pathname || ""}${url.search || ""}${url.hash || ""}`, MAX_ROUTE),
      projectId: normalizeText(url.searchParams.get("project") || "", 128),
      sessionId: normalizeText(url.searchParams.get("session") || "", 128),
    };
  } catch {
    return {
      route: normalizeText(`${win.location?.pathname || ""}${win.location?.search || ""}${win.location?.hash || ""}`, MAX_ROUTE),
      projectId: "",
      sessionId: "",
    };
  }
}

function pruneThrottleMap(now = Date.now()) {
  for (const [key, ts] of recentFingerprints.entries()) {
    if (now - Number(ts || 0) > THROTTLE_MS) recentFingerprints.delete(key);
  }
}

function computeFingerprint(event) {
  const basis = JSON.stringify({
    source: String(event?.source || ""),
    event_type: String(event?.event_type || ""),
    severity: String(event?.severity || ""),
    message: String(event?.message || ""),
    route: String(event?.route || ""),
    request_id: String(event?.request_id || ""),
    endpoint: String(event?.context_json?.endpoint || ""),
    status: Number(event?.context_json?.status || 0),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i += 1) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return `f_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sanitizeContextValue(value, depth = 0) {
  if (depth > 5) return { _redacted: "max_depth" };
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_LIST).map((item) => sanitizeContextValue(item, depth + 1));
    if (value.length > MAX_LIST) out.push({ _truncated_items: value.length - MAX_LIST });
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    const entries = Object.entries(value);
    entries.slice(0, MAX_KEYS).forEach(([key, item]) => {
      const normalizedKey = normalizeText(key, 128) || "key";
      const lowered = normalizedKey.toLowerCase();
      if (
        lowered === "authorization"
        || lowered === "cookie"
        || lowered === "cookies"
        || lowered === "set-cookie"
        || lowered.endsWith("token")
      ) {
        out[normalizedKey] = REDACTED;
        return;
      }
      if (lowered === "bpmn_xml" || lowered.endsWith("bpmn_xml")) {
        out[normalizedKey] = { _redacted: "bpmn_xml", size_hint: normalizeText(String(item || "")).length };
        return;
      }
      if (
        lowered === "payload"
        || lowered === "request_body"
        || lowered === "response_body"
        || lowered.endsWith("_payload")
        || lowered.endsWith("_draft")
      ) {
        out[normalizedKey] = { _redacted: "payload" };
        return;
      }
      out[normalizedKey] = sanitizeContextValue(item, depth + 1);
    });
    if (entries.length > MAX_KEYS) out._truncated_keys = entries.length - MAX_KEYS;
    return out;
  }
  if (typeof value === "string") return normalizeText(value, MAX_TEXT);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  return normalizeText(String(value), MAX_TEXT);
}

function sanitizeContextJson(context) {
  return sanitizeContextValue(context && typeof context === "object" ? context : {}, 0);
}

function recordDebug(bucket, payload) {
  const win = currentWindow();
  const list = debugState[bucket];
  if (!Array.isArray(list)) return;
  list.push(payload);
  if (list.length > 20) list.splice(0, list.length - 20);
  if (win) win.__FPC_TELEMETRY_DEBUG__ = debugState;
}

function normalizeTelemetryEvent(input, options = {}) {
  const routeContext = readRouteContext();
  const baseRequestId = normalizeText(input?.request_id || input?.requestId || options?.requestId || "", 128);
  const normalized = {
    schema_version: SCHEMA_VERSION,
    event_type: normalizeText(input?.event_type || input?.eventType || "frontend_nonfatal", 128).toLowerCase(),
    severity: normalizeText(input?.severity || "error", 32).toLowerCase() || "error",
    message: normalizeText(input?.message || input?.error_message || input?.error || "unknown_frontend_error", MAX_TEXT),
    occurred_at: Number(input?.occurred_at || input?.occurredAt || nowTs()) || nowTs(),
    source: normalizeText(input?.source || "frontend", 32).toLowerCase() || "frontend",
    user_id: normalizeText(userContext.userId || input?.user_id || "", 128) || null,
    org_id: normalizeText(userContext.orgId || readStoredOrgId() || input?.org_id || "", 128) || null,
    session_id: normalizeText(input?.session_id || routeContext.sessionId || "", 128) || null,
    project_id: normalizeText(input?.project_id || routeContext.projectId || "", 128) || null,
    route: normalizeText(input?.route || routeContext.route || "", MAX_ROUTE) || null,
    runtime_id: normalizeText(input?.runtime_id || runtimeId, 128) || runtimeId,
    tab_id: normalizeText(input?.tab_id || getTabId(), 128) || getTabId(),
    request_id: baseRequestId || null,
    correlation_id: normalizeText(input?.correlation_id || input?.correlationId || "", 128) || null,
    app_version: normalizeText(input?.app_version || APP_VERSION || "", 64) || null,
    git_sha: normalizeText(input?.git_sha || GIT_SHA || "", 128) || null,
    fingerprint: normalizeText(input?.fingerprint || "", 128) || "",
    context_json: sanitizeContextJson(input?.context_json || input?.context || {}),
  };
  if (!normalized.fingerprint) normalized.fingerprint = computeFingerprint(normalized);
  return normalized;
}

function shouldThrottleFingerprint(fingerprint) {
  const key = String(fingerprint || "").trim();
  if (!key) return false;
  const now = Date.now();
  pruneThrottleMap(now);
  const prev = Number(recentFingerprints.get(key) || 0);
  if (prev && now - prev < THROTTLE_MS) return true;
  recentFingerprints.set(key, now);
  return false;
}

function isTelemetryPath(path) {
  const text = String(path || "").trim();
  return text === TELEMETRY_PATH || text.endsWith(TELEMETRY_PATH);
}

function shouldSuppressEvent(event, options = {}) {
  if (options?.allowTelemetrySelf === true) return false;
  if (telemetrySendDepth > 1) return true;
  if (String(event?.context_json?.endpoint || "") && isTelemetryPath(event.context_json.endpoint)) return true;
  return false;
}

function normalizeErrorLike(error) {
  if (error instanceof Error) {
    return {
      message: normalizeText(error.message || error.name || "Error", MAX_TEXT),
      stack: normalizeText(error.stack || "", MAX_STACK),
      name: normalizeText(error.name || "Error", 128),
    };
  }
  if (typeof error === "string") {
    return { message: normalizeText(error, MAX_TEXT), stack: "", name: "Error" };
  }
  try {
    return {
      message: normalizeText(JSON.stringify(error), MAX_TEXT),
      stack: "",
      name: normalizeText(error?.name || "Error", 128),
    };
  } catch {
    return { message: "unknown_error", stack: "", name: "Error" };
  }
}

export function getRuntimeId() {
  return runtimeId;
}

export function getTelemetryDebugState() {
  return debugState;
}

export function createClientRequestId(prefix = "req") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

export function setTelemetryUserContext({ userId = "", orgId = "" } = {}) {
  userContext = {
    userId: normalizeText(userId, 128),
    orgId: normalizeText(orgId, 128),
  };
}

export async function sendTelemetryEvent(input, options = {}) {
  try {
    const event = normalizeTelemetryEvent(input, options);
    if (shouldSuppressEvent(event, options)) {
      return { ok: false, skipped: "self_noise_suppressed", payload: event };
    }
    if (!options?.bypassThrottle && shouldThrottleFingerprint(event.fingerprint)) {
      return { ok: false, skipped: "throttled", payload: event };
    }
    if (!event.request_id) event.request_id = createClientRequestId("tevt");
    const headers = {
      "Content-Type": "application/json",
      "X-Client-Request-Id": String(event.request_id || createClientRequestId("tevt")),
    };
    const accessToken = readAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const activeOrgId = userContext.orgId || readStoredOrgId();
    if (activeOrgId) headers["X-Org-Id"] = activeOrgId;
    recordDebug("emitted", { payload: event, at: nowTs() });
    telemetrySendDepth += 1;
    const response = await fetch(joinUrl(TELEMETRY_PATH), {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      credentials: "include",
      keepalive: options?.keepalive === true,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    recordDebug("accepted", {
      payload: event,
      status: Number(response.status || 0),
      response: data,
      at: nowTs(),
    });
    return {
      ok: response.ok,
      status: Number(response.status || 0),
      data,
      payload: event,
    };
  } catch (error) {
    recordDebug("failures", {
      message: normalizeText(error?.message || error || "telemetry_send_failed"),
      name: normalizeText(error?.name || "Error", 128),
      at: nowTs(),
    });
    return {
      ok: false,
      status: 0,
      error: normalizeText(error?.message || error || "telemetry_send_failed"),
    };
  } finally {
    telemetrySendDepth = Math.max(0, telemetrySendDepth - 1);
  }
}

export function reportFrontendFatalError({ message = "", error = null, stack = "", componentStack = "", context = {} } = {}) {
  const normalized = normalizeErrorLike(error || message);
  return sendTelemetryEvent({
    source: "frontend",
    event_type: "frontend_fatal",
    severity: "fatal",
    message: normalizeText(message || normalized.message || "frontend_fatal", MAX_TEXT),
    context_json: {
      name: normalized.name,
      stack: normalizeText(stack || normalized.stack || "", MAX_STACK),
      component_stack: normalizeText(componentStack || "", MAX_STACK),
      ...sanitizeContextJson(context || {}),
    },
  }, { keepalive: true });
}

export function reportUnhandledRejection(reason, context = {}) {
  const normalized = normalizeErrorLike(reason);
  return sendTelemetryEvent({
    source: "frontend",
    event_type: "frontend_unhandled_rejection",
    severity: "error",
    message: normalizeText(normalized.message || "unhandled_rejection", MAX_TEXT),
    context_json: {
      name: normalized.name,
      stack: normalizeText(normalized.stack || "", MAX_STACK),
      ...sanitizeContextJson(context || {}),
    },
  }, { keepalive: true });
}

export function reportApiFailureEvent({
  method = "GET",
  endpoint = "",
  url = "",
  status = 0,
  requestId = "",
  aborted = false,
  error = "",
  errorName = "",
  authAttempts = 0,
} = {}) {
  const endpointText = normalizeText(endpoint, MAX_ROUTE);
  if (isTelemetryPath(endpointText) || isTelemetryPath(url)) {
    return Promise.resolve({ ok: false, skipped: "telemetry_self_noise" });
  }
  return sendTelemetryEvent({
    source: "frontend",
    event_type: "api_failure",
    severity: aborted ? "warn" : "error",
    message: normalizeText(error || (status ? `HTTP ${status}` : "network_error"), MAX_TEXT),
    request_id: normalizeText(requestId, 128) || null,
    context_json: {
      method: normalizeText(method, 16),
      endpoint: endpointText,
      url: normalizeText(url, MAX_ROUTE),
      status: Number(status || 0),
      aborted: Boolean(aborted),
      error_name: normalizeText(errorName || "", 128),
      auth_attempts: Number(authAttempts || 0),
    },
  });
}

export function installGlobalFrontendTelemetry() {
  const win = currentWindow();
  if (!win || listenersInstalled) return;
  listenersInstalled = true;
  win.__FPC_TELEMETRY_DEBUG__ = debugState;
  win.addEventListener("error", (event) => {
    try {
      const message = normalizeText(event?.message || event?.error?.message || "window_error", MAX_TEXT);
      void reportFrontendFatalError({
        message,
        error: event?.error || null,
        stack: event?.error?.stack || "",
        context: {
          filename: normalizeText(event?.filename || "", MAX_ROUTE),
          lineno: Number(event?.lineno || 0),
          colno: Number(event?.colno || 0),
        },
      });
    } catch {
      // never throw from telemetry hook
    }
  });
  win.addEventListener("unhandledrejection", (event) => {
    try {
      void reportUnhandledRejection(event?.reason, {
        reason_type: normalizeText(event?.reason?.name || typeof event?.reason, 128),
      });
    } catch {
      // never throw from telemetry hook
    }
  });
}

export function __resetTelemetryForTests() {
  recentFingerprints.clear();
  debugState.emitted.splice(0, debugState.emitted.length);
  debugState.accepted.splice(0, debugState.accepted.length);
  debugState.failures.splice(0, debugState.failures.length);
  userContext = { userId: "", orgId: "" };
  listenersInstalled = false;
  telemetrySendDepth = 0;
  memoryTabId = "";
}
