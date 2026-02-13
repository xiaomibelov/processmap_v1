import axios from "axios";

function okResult(data, status) {
  return { ok: true, status, ...data };
}

function errResult(error, status = 0) {
  return { ok: false, status, error: String(error || "error") };
}

async function requestJson(method, url, body) {
  try {
    const r = await axios({
      method,
      url,
      data: body,
      headers: { "Content-Type": "application/json" },
      withCredentials: true,
    });
    return okResult({ data: r.data }, r.status);
  } catch (e) {
    const status = e?.response?.status || 0;
    const msg =
      e?.response?.data?.detail ||
      e?.response?.data?.error ||
      e?.message ||
      "request failed";
    return errResult(msg, status);
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
  const r = await requestJson("GET", "/api/meta");
  if (!r.ok) return r;
  return okResult({ meta: r.data }, r.status);
}

export async function apiListProjects() {
  const r = await requestJson("GET", "/api/projects");
  if (!r.ok) return r;
  return okResult({ projects: _asArray(r.data) }, r.status);
}

export async function apiCreateProject(payload) {
  const r = await requestJson("POST", "/api/projects", payload);
  if (!r.ok) return r;
  return okResult({ project: r.data }, r.status);
}

export async function apiGetProject(projectId) {
  const r = await requestJson("GET", `/api/projects/${projectId}`);
  if (!r.ok) return r;
  return okResult({ project: r.data }, r.status);
}

export async function apiPatchProject(projectId, patch) {
  const r = await requestJson("PATCH", `/api/projects/${projectId}`, patch);
  if (!r.ok) return r;
  return okResult({ project: r.data }, r.status);
}

export async function apiListSessions() {
  const r = await requestJson("GET", "/api/sessions");
  if (!r.ok) return r;
  return okResult({ sessions: _asArray(r.data) }, r.status);
}

export async function apiCreateSession(payload) {
  const r = await requestJson("POST", "/api/sessions", payload);
  if (!r.ok) return r;
  return okResult({ session: r.data }, r.status);
}

export async function apiGetSession(sessionId) {
  const r = await requestJson("GET", `/api/sessions/${sessionId}`);
  if (!r.ok) return r;
  return okResult({ session: r.data }, r.status);
}

export async function apiPatchSession(sessionId, patch) {
  const r = await requestJson("PATCH", `/api/sessions/${sessionId}`, patch);
  if (!r.ok) return r;
  return okResult({ session: r.data }, r.status);
}

export async function apiGetBpmn(sessionId) {
  const r = await requestJson("GET", `/api/sessions/${sessionId}/bpmn`);
  if (!r.ok) return r;
  return okResult({ bpmn: r.data }, r.status);
}

export async function apiNormalize(sessionId, payload) {
  const r = await requestJson("POST", `/api/sessions/${sessionId}/normalize`, payload);
  if (!r.ok) return r;
  return okResult({ normalized: r.data }, r.status);
}

export async function apiListProjectSessions(projectId, mode = null) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  const r = await requestJson("GET", `/api/projects/${projectId}/sessions${qs}`);
  if (!r.ok) return r;
  return okResult({ sessions: _asArray(r.data) }, r.status);
}

export async function apiCreateProjectSession(projectId, { title, roles, mode }) {
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  const r = await requestJson("POST", `/api/projects/${projectId}/sessions${qs}`, {
    title,
    roles,
  });
  if (!r.ok) return r;
  return okResult({ session: r.data }, r.status);
}
