/**
 * Minimal API client for Food Process Copilot.
 *
 * Notes:
 * - Uses native fetch() to avoid extra deps (axios).
 * - All functions return a uniform shape:
 *   { ok: true, status, data } OR { ok: false, status, error }.
 * - BASE_URL can be set via VITE_API_BASE (default: same origin).
 */

function okResult(data, status) {
  return { ok: true, status, ...data };
}

function errResult(error, status = 0) {
  return { ok: false, status, error: String(error || "error") };
}

function _baseUrl() {
  const v = import.meta?.env?.VITE_API_BASE;
  if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

async function requestJson(method, url, body) {
  try {
    const init = {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    };

    if (body !== undefined && body !== null && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const r = await fetch(url, init);
    const text = await r.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_e) {
        data = text;
      }
    }

    if (r.ok) return okResult({ data }, r.status);

    const msg =
      (data && typeof data === "object" && (data.detail || data.error)) ||
      text ||
      "request failed";
    return errResult(msg, r.status);
  } catch (e) {
    return errResult(e?.message || e, 0);
  }
}

async function requestText(method, url, body) {
  try {
    const init = {
      method,
      headers: { "Content-Type": "application/json" },
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

function _asArray(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (maybe && typeof maybe === "object") {
    if (Array.isArray(maybe.items)) return maybe.items;
    if (Array.isArray(maybe.sessions)) return maybe.sessions;
    if (Array.isArray(maybe.projects)) return maybe.projects;
  }
  return [];
}

export async function apiMeta() {
  const base = _baseUrl();
  return requestJson("GET", `${base}/api/meta`);
}

export async function apiListProjects() {
  const base = _baseUrl();
  return requestJson("GET", `${base}/api/projects`);
}

export async function apiCreateProject(payload) {
  const base = _baseUrl();
  return requestJson("POST", `${base}/api/projects`, payload || {});
}

export async function apiGetProject(projectId) {
  const base = _baseUrl();
  return requestJson("GET", `${base}/api/projects/${projectId}`);
}

export async function apiPatchProject(projectId, payload) {
  const base = _baseUrl();
  return requestJson("PATCH", `${base}/api/projects/${projectId}`, payload || {});
}

export async function apiListProjectSessions(projectId, mode) {
  const base = _baseUrl();
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return requestJson("GET", `${base}/api/projects/${projectId}/sessions${qs}`);
}

export async function apiCreateProjectSession(projectId, mode, payload) {
  const base = _baseUrl();
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  return requestJson("POST", `${base}/api/projects/${projectId}/sessions${qs}`, payload || {});
}

export async function apiListSessions() {
  const base = _baseUrl();
  const r = await requestJson("GET", `${base}/api/sessions`);
  if (!r.ok) return r;
  return okResult({ data: _asArray(r.data) }, r.status);
}

export async function apiCreateSession(payload) {
  const base = _baseUrl();
  return requestJson("POST", `${base}/api/sessions`, payload || {});
}

export async function apiGetSession(id) {
  const base = _baseUrl();
  return requestJson("GET", `${base}/api/sessions/${id}`);
}

export async function apiPatchSession(id, payload) {
  const base = _baseUrl();
  return requestJson("PATCH", `${base}/api/sessions/${id}`, payload || {});
}

export async function apiNormalize(id) {
  const base = _baseUrl();
  // Optional: backend may not expose /normalize yet. UI should tolerate 404.
  return requestJson("POST", `${base}/api/sessions/${id}/normalize`, {});
}

export async function apiGetBpmn(id) {
  const base = _baseUrl();
  // /bpmn returns XML text
  return requestText("GET", `${base}/api/sessions/${id}/bpmn`);
}

export async function apiExportZip(id) {
  const base = _baseUrl();
  return requestJson("GET", `${base}/api/sessions/${id}/export_zip`);
}
