import { apiRoutes } from "../apiRoutes.js";
import { apiRequest as request, okOrError } from "../apiCore.js";

// ------- Admin (aggregated payloads) -------
function normalizeAdminParams(params = {}) {
  const out = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    out[String(key)] = text;
  });
  return out;
}

export async function apiAdminGetDashboard(params = {}) {
  const endpoint = apiRoutes.admin.dashboard(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListOrgs() {
  const r = okOrError(await request(apiRoutes.admin.orgs(), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListUsers() {
  const r = okOrError(await request(apiRoutes.admin.users(), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminCreateUser(payload = {}) {
  const membershipsRaw = Array.isArray(payload?.memberships) ? payload.memberships : [];
  const body = {
    email: String(payload?.email || "").trim(),
    password: String(payload?.password || ""),
    full_name: String(payload?.full_name || payload?.fullName || "").trim(),
    job_title: String(payload?.job_title || payload?.jobTitle || "").trim(),
    is_admin: payload?.is_admin === true,
    is_active: payload?.is_active !== false,
    memberships: membershipsRaw.map((row) => ({
      org_id: String(row?.org_id || "").trim(),
      role: String(row?.role || "org_viewer").trim() || "org_viewer",
    })).filter((row) => row.org_id),
  };
  const r = okOrError(await request(apiRoutes.admin.users(), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminPatchUser(userId, payload = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  const body = {};
  if (Object.prototype.hasOwnProperty.call(payload || {}, "email")) body.email = String(payload?.email || "").trim();
  if (Object.prototype.hasOwnProperty.call(payload || {}, "password")) body.password = String(payload?.password || "");
  if (Object.prototype.hasOwnProperty.call(payload || {}, "full_name")) body.full_name = String(payload?.full_name || "").trim();
  if (Object.prototype.hasOwnProperty.call(payload || {}, "fullName")) body.full_name = String(payload?.fullName || "").trim();
  if (Object.prototype.hasOwnProperty.call(payload || {}, "job_title")) body.job_title = String(payload?.job_title || "").trim();
  if (Object.prototype.hasOwnProperty.call(payload || {}, "jobTitle")) body.job_title = String(payload?.jobTitle || "").trim();
  if (Object.prototype.hasOwnProperty.call(payload || {}, "is_admin")) body.is_admin = payload?.is_admin === true;
  if (Object.prototype.hasOwnProperty.call(payload || {}, "is_active")) body.is_active = Boolean(payload?.is_active);
  if (Object.prototype.hasOwnProperty.call(payload || {}, "memberships")) {
    const membershipsRaw = Array.isArray(payload?.memberships) ? payload.memberships : [];
    body.memberships = membershipsRaw.map((row) => ({
      org_id: String(row?.org_id || "").trim(),
      role: String(row?.role || "org_viewer").trim() || "org_viewer",
    })).filter((row) => row.org_id);
  }
  const r = okOrError(await request(apiRoutes.admin.user(uid), { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListProjects(params = {}) {
  const endpoint = apiRoutes.admin.projects(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListSessions(params = {}) {
  const endpoint = apiRoutes.admin.sessions(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminGetSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.admin.session(sid), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListJobs() {
  const r = okOrError(await request(apiRoutes.admin.jobs(), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListAudit(params = {}) {
  const endpoint = apiRoutes.admin.audit(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListErrorEvents(params = {}) {
  const endpoint = apiRoutes.admin.errorEvents(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminGetErrorEvent(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing event_id" };
  const r = okOrError(await request(apiRoutes.admin.errorEvent(id), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminGetAiModules() {
  const r = okOrError(await request(apiRoutes.admin.aiModules(), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListAiExecutions(params = {}) {
  const endpoint = apiRoutes.admin.aiExecutions(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminListAiPrompts(params = {}) {
  const endpoint = apiRoutes.admin.aiPrompts(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminGetActiveAiPrompt(params = {}) {
  const endpoint = apiRoutes.admin.aiPromptActive(normalizeAdminParams(params));
  const r = okOrError(await request(endpoint, { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminGetAiPrompt(promptId) {
  const id = String(promptId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing prompt_id" };
  const r = okOrError(await request(apiRoutes.admin.aiPrompt(id), { method: "GET" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminCreateAiPrompt(payload = {}) {
  const body = {
    module_id: String(payload?.module_id || payload?.moduleId || "").trim(),
    version: String(payload?.version || "").trim(),
    template: String(payload?.template || ""),
    scope_level: String(payload?.scope_level || payload?.scopeLevel || "global").trim() || "global",
    scope_id: String(payload?.scope_id || payload?.scopeId || "").trim(),
    variables_schema: payload?.variables_schema && typeof payload.variables_schema === "object" && !Array.isArray(payload.variables_schema)
      ? payload.variables_schema
      : {},
    output_schema: payload?.output_schema && typeof payload.output_schema === "object" && !Array.isArray(payload.output_schema)
      ? payload.output_schema
      : {},
  };
  const r = okOrError(await request(apiRoutes.admin.aiPrompts(), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminActivateAiPrompt(promptId) {
  const id = String(promptId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing prompt_id" };
  const r = okOrError(await request(apiRoutes.admin.aiPromptActivate(id), { method: "POST" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}

export async function apiAdminArchiveAiPrompt(promptId) {
  const id = String(promptId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing prompt_id" };
  const r = okOrError(await request(apiRoutes.admin.aiPromptArchive(id), { method: "POST" }));
  return r.ok ? { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} } : r;
}
