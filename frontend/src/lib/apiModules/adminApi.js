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
