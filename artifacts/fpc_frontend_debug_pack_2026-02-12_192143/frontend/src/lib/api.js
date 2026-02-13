/**
 * Minimal API client for Food Process Copilot.
 *
 * Notes:
 * - Uses native fetch() to avoid extra deps (axios).
 * - All functions return a uniform shape:
 *   { ok: true, status, ... } OR { ok: false, status, error }.
 *
 * IMPORTANT:
 * - All paths below already start with /api/...
 * - VITE_API_BASE is treated as an ORIGIN (e.g. "http://127.0.0.1:8011") or empty.
 * - If someone mistakenly sets VITE_API_BASE=/api (or .../api), we treat it as "same origin"
 *   to avoid /api/api/... and backend redirects (which often jump to a different port/origin).
 */

function okResult(data, status) {
  return { ok: true, status, ...data };
}

function errResult(error, status) {
  return { ok: false, status, error: String(error || "request failed") };
}

function _baseUrl() {
  const raw = import.meta?.env?.VITE_API_BASE;
  if (typeof raw !== "string") return "";
  let v = raw.trim();
  if (!v) return "";

  // remove trailing slashes
  v = v.replace(/\/+$/g, "");

  // treat "/api" (or ".../api") as "same origin"
  if (v === "/api") return "";
  if (v.endsWith("/api")) v = v.slice(0, -4);

  if (v === "/" || v === "") return "";
  return v;
}

function apiUrl(path) {
  const base = _baseUrl();
  if (!base) return path;
  return `${base}${path}`;
}

async function requestJson(method, url, body) {
  try {
    const init = {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
    };

    if (body !== undefined && body !== null && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const r = await fetch(url, init);
    const text = await r.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (r.ok) return okResult({ data }, r.status);

    return errResult(data?.error || text || "request failed", r.status);
  } catch (e) {
    return errResult(e?.message || e, 0);
  }
}

async function requestText(method, url, body) {
  try {
    const init = {
      method,
      headers: {
        Accept: "text/plain, application/xml, */*",
        "Content-Type": "application/json",
      },
      credentials: "include",
    };

    if (body !== undefined && body !== null && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const r = await fetch(url, init);
    const text = await r.text();

    if (r.ok) return okResult({ data: text }, r.status);

    return errResult(text || "request failed", r.status);
  } catch (e) {
    return errResult(e?.message || e, 0);
  }
}

/* META */

export async function apiMeta() {
  return requestJson("GET", apiUrl(`/api/meta`));
}

/* PROJECTS */

export async function apiListProjects() {
  return requestJson("GET", apiUrl(`/api/projects`));
}

export async function apiCreateProject(payload) {
  return requestJson("POST", apiUrl(`/api/projects`), payload || {});
}

export async function apiGetProject(id) {
  return requestJson("GET", apiUrl(`/api/projects/${id}`));
}

export async function apiPatchProject(id, payload) {
  return requestJson("PATCH", apiUrl(`/api/projects/${id}`), payload || {});
}

/* PROJECT SESSIONS (feature-flagged on backend) */

export async function apiListProjectSessions(projectId, mode) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return requestJson("GET", apiUrl(`/api/projects/${projectId}/sessions${qs}`));
}

export async function apiCreateProjectSession(projectId, mode, payload) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return requestJson("POST", apiUrl(`/api/projects/${projectId}/sessions${qs}`), payload || {});
}

/* SESSIONS */

export async function apiListSessions() {
  const base = _baseUrl();
  const r = await requestJson("GET", apiUrl(`/api/sessions`));
  if (!r.ok) return r;

  // some backends might return {items:[...]} or {data:{items:[...]}}; normalize lightly
  const d = r.data || null;
  const items = d?.items || d || [];
  return okResult({ items }, r.status);
}

export async function apiCreateSession(payload) {
  return requestJson("POST", apiUrl(`/api/sessions`), payload || {});
}

export async function apiGetSession(id) {
  return requestJson("GET", apiUrl(`/api/sessions/${id}`));
}

export async function apiPatchSession(id, payload) {
  return requestJson("PATCH", apiUrl(`/api/sessions/${id}`), payload || {});
}

/* OPTIONAL helpers */

export async function apiNormalize(id) {
  return requestJson("POST", apiUrl(`/api/sessions/${id}/normalize`), {});
}

/* BPMN */

export async function apiGetBpmn(id) {
  // /bpmn returns XML text. IMPORTANT: NO trailing slash here (backend redirects /bpmn/ -> other origin/port)
  return requestText("GET", apiUrl(`/api/sessions/${id}/bpmn`));
}

/* EXPORTS */

export async function apiExportZip(id) {
  // backend-specific; keep as text/blob if needed later
  return requestText("GET", apiUrl(`/api/sessions/${id}/export.zip`));
}
