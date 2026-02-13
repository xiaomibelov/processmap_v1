/**
 * Minimal API client for Food Process Copilot.
 *
 * Contract:
 * - All functions return a uniform shape that UI expects:
 *   { ok:true, status, meta? , items? , project? , session? , data? }
 *   OR { ok:false, status, error }
 *
 * Notes:
 * - Uses native fetch().
 * - Paths start with /api/...
 * - VITE_API_BASE is treated as an ORIGIN (e.g. "http://127.0.0.1:8011") or empty.
 * - If someone sets VITE_API_BASE=/api (or .../api), treat as "same origin".
 */

function okResult(data, status) {
  return { ok: true, status, ...(data || {}) };
}

function errResult(error, status) {
  return { ok: false, status, error: String(error || "request failed") };
}

function _baseUrl() {
  const raw = import.meta?.env?.VITE_API_BASE;
  if (typeof raw !== "string") return "";
  let v = raw.trim();
  if (!v) return "";

  v = v.replace(/\/+$/g, "");

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

async function request(method, url, body, accept) {
  try {
    const init = {
      method,
      headers: {
        Accept: accept || "application/json",
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
    if ((accept || "").includes("application/json")) {
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
    } else {
      data = text;
    }

    if (r.ok) return okResult({ data }, r.status);

    // backend might return {error:"..."} or plain text
    const errMsg =
      (typeof data === "object" && data && (data.error || data.detail)) ? (data.error || data.detail)
      : (typeof data === "string" && data ? data : text || "request failed");

    return errResult(errMsg, r.status);
  } catch (e) {
    return errResult(e?.message || e, 0);
  }
}

/* META */

export async function apiMeta() {
  const r = await request("GET", apiUrl(`/api/meta`), null, "application/json");
  if (!r.ok) return r;
  // UI expects r.meta.features
  const meta = r.data || {};
  return okResult({ meta }, r.status);
}

/* PROJECTS */

export async function apiListProjects() {
  const r = await request("GET", apiUrl(`/api/projects`), null, "application/json");
  if (!r.ok) return r;
  const items = Array.isArray(r.data) ? r.data : (r.data?.items || []);
  return okResult({ items }, r.status);
}

export async function apiCreateProject(payload) {
  const r = await request("POST", apiUrl(`/api/projects`), payload || {}, "application/json");
  if (!r.ok) return r;
  // backend returns the created project object
  const project = r.data?.project || r.data;
  return okResult({ project }, r.status);
}

export async function apiGetProject(id) {
  const r = await request("GET", apiUrl(`/api/projects/${id}`), null, "application/json");
  if (!r.ok) return r;
  const project = r.data?.project || r.data;
  return okResult({ project }, r.status);
}

export async function apiPatchProject(id, payload) {
  const r = await request("PATCH", apiUrl(`/api/projects/${id}`), payload || {}, "application/json");
  if (!r.ok) return r;
  const project = r.data?.project || r.data;
  return okResult({ project }, r.status);
}

/* PROJECT SESSIONS */

export async function apiListProjectSessions(projectId, mode) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  const r = await request("GET", apiUrl(`/api/projects/${projectId}/sessions${qs}`), null, "application/json");
  if (!r.ok) return r;
  const items = Array.isArray(r.data) ? r.data : (r.data?.items || []);
  return okResult({ items }, r.status);
}

export async function apiCreateProjectSession(projectId, mode, payload) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  const r = await request("POST", apiUrl(`/api/projects/${projectId}/sessions${qs}`), payload || {}, "application/json");
  if (!r.ok) return r;
  const session = r.data?.session || r.data;
  return okResult({ session }, r.status);
}

/* SESSIONS (legacy / fallback) */

export async function apiListSessions() {
  const r = await request("GET", apiUrl(`/api/sessions`), null, "application/json");
  if (!r.ok) return r;
  const items = Array.isArray(r.data) ? r.data : (r.data?.items || []);
  return okResult({ items }, r.status);
}

export async function apiCreateSession(payload) {
  const r = await request("POST", apiUrl(`/api/sessions`), payload || {}, "application/json");
  if (!r.ok) return r;
  const session = r.data?.session || r.data;
  return okResult({ session }, r.status);
}

export async function apiGetSession(id) {
  const r = await request("GET", apiUrl(`/api/sessions/${id}`), null, "application/json");
  if (!r.ok) return r;
  const session = r.data?.session || r.data;
  return okResult({ session }, r.status);
}

export async function apiPatchSession(id, payload) {
  const r = await request("PATCH", apiUrl(`/api/sessions/${id}`), payload || {}, "application/json");
  if (!r.ok) return r;
  const session = r.data?.session || r.data;
  return okResult({ session }, r.status);
}

/* OPTIONAL helpers */

export async function apiNormalize(id) {
  return request("POST", apiUrl(`/api/sessions/${id}/normalize`), {}, "application/json");
}

/* BPMN */

async function getBpmnText(path) {
  return request("GET", apiUrl(path), null, "text/plain, application/xml, */*");
}

export async function apiGetBpmn(id) {
  // Prefer new endpoint for project sessions; fallback to legacy sessions endpoint.
  // IMPORTANT: no trailing slash (avoid redirects).
  const r1 = await getBpmnText(`/api/project-sessions/${id}/bpmn`);
  if (r1.ok) return okResult({ data: r1.data }, r1.status);

  const r2 = await getBpmnText(`/api/sessions/${id}/bpmn`);
  if (r2.ok) return okResult({ data: r2.data }, r2.status);

  return r1.status ? r1 : r2;
}

/* EXPORTS */

export async function apiExportZip(id) {
  return request("GET", apiUrl(`/api/sessions/${id}/export.zip`), null, "application/zip, application/octet-stream, */*");
}
