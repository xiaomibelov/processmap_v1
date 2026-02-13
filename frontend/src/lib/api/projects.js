import { requestJson, normalizeList, pickId, str } from "./http";

export async function apiListProjects() {
  const r = await requestJson("/api/projects");
  if (!r.ok) return r;

  const list = normalizeList(r.data, ["projects", "items", "data"]);
  return { ok: true, projects: list };
}

export async function apiCreateProject(payload) {
  const body = {
    title: str(payload?.title),
    passport: payload?.passport || {},
  };

  const r = await requestJson("/api/projects", { method: "POST", body });
  if (!r.ok) return r;

  const project_id = pickId(r.data) || str(r.data?.project_id);
  return { ok: true, project_id, data: r.data };
}

export async function apiGetProject(projectId) {
  const pid = str(projectId);
  const r = await requestJson(`/api/projects/${pid}`);
  if (!r.ok) return r;
  return { ok: true, project: r.data };
}

export async function apiPatchProject(projectId, patch) {
  const pid = str(projectId);
  const r = await requestJson(`/api/projects/${pid}`, { method: "PATCH", body: patch || {} });
  if (!r.ok) return r;
  return { ok: true, project: r.data };
}

export async function apiPutProject(projectId, payload) {
  const pid = str(projectId);
  const body = {
    title: str(payload?.title),
    passport: payload?.passport || {},
  };
  const r = await requestJson(`/api/projects/${pid}`, { method: "PUT", body });
  if (!r.ok) return r;
  return { ok: true, project: r.data };
}

export async function apiListProjectSessions(projectId) {
  const pid = str(projectId);
  // IMPORTANT: no mode query here (OpenAPI doesn't define it)
  const r = await requestJson(`/api/projects/${pid}/sessions`);
  if (!r.ok) return r;

  const list = normalizeList(r.data, ["sessions", "items", "data"]);
  return { ok: true, sessions: list };
}

export async function apiCreateProjectSession(projectId, modeOrPayload) {
  const pid = str(projectId);

  // compatibility: accept (mode: string) OR ({title, roles, start_role})
  let title = "";
  let roles = null;
  let start_role = null;

  if (typeof modeOrPayload === "string") {
    const m = str(modeOrPayload) || "quick_skeleton";
    title = `Session (${m})`;
  } else {
    title = str(modeOrPayload?.title);
    roles = modeOrPayload?.roles ?? null;
    start_role = modeOrPayload?.start_role ?? null;
  }

  if (!title) title = "Session";

  const body = { title, roles, start_role };

  const r = await requestJson(`/api/projects/${pid}/sessions`, { method: "POST", body });
  if (!r.ok) return r;

  // Some backends return none; others return {session_id}
  const session_id = str(r.data?.session_id) || str(r.data?.id);
  return { ok: true, session_id, data: r.data };
}
