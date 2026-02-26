function readApiBase() {
  const raw = String(import.meta?.env?.VITE_API_BASE || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

const API_BASE = readApiBase(); // default: Vite proxy /api -> backend

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

function isJsonResponse(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}

async function readError(res) {
  try {
    if (isJsonResponse(res)) {
      const j = await res.json();
      if (j && typeof j === "object") {
        if (typeof j.detail === "string") return j.detail;
        if (Array.isArray(j.detail)) {
          // FastAPI validation errors
          return j.detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
        }
        return JSON.stringify(j);
      }
    }
    const t = await res.text();
    return t || `${res.status} ${res.statusText}`;
  } catch (e) {
    return `${res.status} ${res.statusText}`;
  }
}

export async function requestJson(path, { method = "GET", body = null, headers = {} } = {}) {
  const url = joinUrl(path);
  const opts = {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  try {
    const res = await fetch(url, opts);
    if (!res.ok) return { ok: false, status: res.status, error: await readError(res) };

    // Some endpoints may return empty body (OpenAPI says "none")
    const txt = await res.text();
    if (!txt) return { ok: true, status: res.status, data: null };

    try {
      return { ok: true, status: res.status, data: JSON.parse(txt) };
    } catch {
      // backend returned non-JSON
      return { ok: true, status: res.status, data: txt };
    }
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e) };
  }
}

export async function requestText(path, { method = "GET", headers = {} } = {}) {
  const url = joinUrl(path);
  try {
    const res = await fetch(url, { method, headers });
    if (!res.ok) return { ok: false, status: res.status, error: await readError(res) };
    return { ok: true, status: res.status, text: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e) };
  }
}

export function str(v) {
  return String(v ?? "").trim();
}

export function normalizeList(payload, keys = ["items", "sessions", "projects", "data"]) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const k of keys) {
      const v = payload[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function pickId(obj) {
  if (!obj || typeof obj !== "object") return "";
  return String(obj.session_id || obj.project_id || obj.id || obj.pk || "");
}
