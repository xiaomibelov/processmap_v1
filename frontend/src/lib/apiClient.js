function readApiBase() {
  const raw = String(import.meta?.env?.VITE_API_BASE || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

const API_BASE = readApiBase();

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

export function normalizeApiErrorPayload(payload) {
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

export function isPlainObject(value) {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && !(value instanceof FormData)
    && !(value instanceof Blob);
}

function toHeaders(rawHeaders) {
  return rawHeaders instanceof Headers ? rawHeaders : new Headers(rawHeaders || {});
}

export async function apiFetch({
  path,
  method = "GET",
  headers,
  body,
  signal,
  authToken = "",
  auth = true,
  orgId = "",
  withOrgHeader = true,
}) {
  const endpoint = String(path || "");
  const requestMethod = String(method || "GET").toUpperCase();
  const url = joinUrl(endpoint);
  const requestHeaders = toHeaders(headers);
  const hasBody = body !== undefined && body !== null;
  let requestBody = body;

  if (auth && authToken && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${String(authToken || "").trim()}`);
  }
  if (withOrgHeader && endpoint.startsWith("/api") && orgId && !requestHeaders.has("X-Org-Id")) {
    requestHeaders.set("X-Org-Id", String(orgId || "").trim());
  }
  if (hasBody && isPlainObject(requestBody)) {
    if (!requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(requestBody);
  }

  let response;
  try {
    response = await fetch(url, {
      method: requestMethod,
      headers: requestHeaders,
      body: hasBody ? requestBody : undefined,
      credentials: "include",
      signal,
    });
  } catch (error) {
    const aborted = !!signal?.aborted || String(error?.name || "").toLowerCase() === "aborterror";
    const message = String(error?.message || error || "network error");
    return {
      ok: false,
      status: 0,
      error: message,
      error_name: String(error?.name || "Error"),
      error_message: message,
      aborted,
      data: null,
      text: "",
      method: requestMethod,
      endpoint,
      url,
      request_url: url,
      request_method: requestMethod,
      response_text: "",
    };
  }

  const status = Number(response.status || 0);
  const contentType = String(response.headers.get("content-type") || "");
  let data = null;
  let text = "";
  try {
    if (contentType.includes("application/json")) data = await response.json();
    else text = await response.text();
  } catch {
    // ignore parse errors
  }

  if (!response.ok) {
    return {
      ok: false,
      status,
      error: normalizeApiErrorPayload(data) || text || `HTTP ${status}`,
      data,
      text,
      method: requestMethod,
      endpoint,
      url,
      response_text: text,
    };
  }

  return {
    ok: true,
    status,
    data,
    text,
    method: requestMethod,
    endpoint,
    url,
  };
}

export async function apiFetchWithFallback({
  op = "",
  primaryPath,
  fallbackPath = "",
  method = "GET",
  headers,
  body,
  signal,
  authToken = "",
  auth = true,
  orgId = "",
  withOrgHeader = true,
  fallbackStatuses = [404, 405],
}) {
  const primary = await apiFetch({
    path: primaryPath,
    method,
    headers,
    body,
    signal,
    authToken,
    auth,
    orgId,
    withOrgHeader,
  });
  if (primary.ok || !fallbackPath) return primary;
  const status = Number(primary?.status || 0);
  if (!fallbackStatuses.includes(status)) return primary;

  if (typeof console !== "undefined" && typeof console.warn === "function") {
    // eslint-disable-next-line no-console
    console.warn("[API_FALLBACK_USED]", {
      op: String(op || "unknown"),
      primary: String(primaryPath || ""),
      fallback: String(fallbackPath || ""),
      status,
    });
  }

  return apiFetch({
    path: fallbackPath,
    method,
    headers,
    body,
    signal,
    authToken,
    auth,
    orgId,
    withOrgHeader,
  });
}

export default {
  apiFetch,
  apiFetchWithFallback,
  isPlainObject,
  normalizeApiErrorPayload,
};
