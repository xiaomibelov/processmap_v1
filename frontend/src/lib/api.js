import { isPlainObject } from "./apiClient.js";
import { apiRoutes } from "./apiRoutes.js";
import {
  apiRequest as request,
  fnv1aHex,
  getActiveOrgId,
  normalizeNotes,
  okOrError,
  shouldLogBpmnTrace,
} from "./apiCore.js";

function shouldTraceSessionsFallback() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_TRACE_SESSIONS_FALLBACK__ === true) return true;
  try {
    return window.localStorage?.getItem("fpc:trace-sessions-fallback") === "1";
  } catch {
    return false;
  }
}

function compactStackMarker(limit = 3) {
  try {
    const raw = String(new Error().stack || "");
    const lines = raw
      .split("\n")
      .slice(2, 2 + Number(limit || 3))
      .map((line) => line.trim().replace(/^at\s+/, ""));
    return lines.join(" <- ");
  } catch {
    return "";
  }
}

export {
  apiAuthInviteActivate,
  apiAuthInvitePreview,
  apiAuthLogin,
  apiAuthLogout,
  apiAuthMe,
  apiAuthRefresh,
  apiInviteActivate,
  apiInviteResolve,
  apiRequest,
  clearAccessToken,
  getAccessToken,
  getActiveOrgId,
  onAuthFailure,
  setAccessToken,
  setActiveOrgId,
} from "./apiCore.js";

export * from "./apiModules/adminApi.js";
export * from "./apiModules/orgApi.js";

// ------- Meta -------
export async function apiMeta() {
  const r = okOrError(await request(apiRoutes.misc.meta()));
  return r.ok ? { ok: true, status: r.status, meta: r.data } : r;
}

// ------- Glossary -------
export async function apiGlossaryAdd(payload) {
  const r = okOrError(await request(apiRoutes.misc.glossaryAdd(), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Projects -------
export async function apiListProjects() {
  const r = okOrError(await request(apiRoutes.projects.list()));
  const list = Array.isArray(r.data) ? r.data : [];
  return r.ok ? { ok: true, status: r.status, projects: list, items: list } : r;
}

function normalizeCreateProjectPayload(payload) {
  // Backend expects CreateProjectIn: { title: string, passport?: object }
  if (typeof payload === "string") {
    const title = payload.trim();
    return { title, passport: {} };
  }
  if (isPlainObject(payload)) {
    const title = String(payload.title || payload.name || payload.project_title || payload.projectTitle || "").trim();
    const passportRaw = payload.passport ?? payload.process_passport ?? payload.processPassport ?? {};
    const passport = isPlainObject(passportRaw) ? passportRaw : {};
    const out = { ...payload, title, passport };
    delete out.name;
    delete out.project_title;
    delete out.projectTitle;
    delete out.process_passport;
    delete out.processPassport;
    return out;
  }
  return { title: "", passport: {} };
}

export async function apiCreateProject(payload) {
  const body = normalizeCreateProjectPayload(payload);
  if (!String(body.title || "").trim()) {
    return { ok: false, status: 0, error: "project title required" };
  }

  const r = okOrError(await request(apiRoutes.projects.create(), { method: "POST", body }));
  if (!r.ok) return r;

  const project_id = String(r.data?.id || r.data?.project_id || "").trim();
  return { ok: true, status: r.status, project_id, project: r.data };
}

export async function apiGetProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.projects.item(id)));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPatchProject(projectId, patch) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.projects.item(id), { method: "PATCH", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPutProject(projectId, body) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.projects.item(id), { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiDeleteProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  return okOrError(await request(apiRoutes.projects.item(id), { method: "DELETE" }));
}

// ------- Project Sessions -------
export async function apiListProjectSessions(projectId, mode) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const r = okOrError(await request(apiRoutes.projects.sessions(pid, m)));
  const list = Array.isArray(r.data) ? r.data : [];
  return r.ok ? { ok: true, status: r.status, sessions: list } : r;
}

export async function apiCreateProjectSession(projectId, mode, title, roles, start_role, ai_prep_questions) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const t = String(title || "process").trim() || "process";
  const roleList = Array.isArray(roles) ? roles : undefined;
  const startRole = start_role === undefined ? undefined : String(start_role || "").trim();

  // backend expects CreateSessionIn: { title: string, roles?: any, start_role?: string }
  const body = { title: t };
  if (roleList !== undefined) body.roles = roleList;
  if (startRole !== undefined) body.start_role = startRole;
  if (Array.isArray(ai_prep_questions)) {
    body.ai_prep_questions = ai_prep_questions;
  }

  const r = okOrError(await request(apiRoutes.projects.sessions(pid, m), { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

// ------- Enterprise Project Members -------
export async function apiListOrgProjectMembers(orgId, projectId) {
  const oid = String(orgId || "").trim();
  const pid = String(projectId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  const endpoint = apiRoutes.orgs.projectMembers(oid, pid);
  const r = okOrError(await request(endpoint, { method: "GET" }));
  const items = Array.isArray(r?.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, items, count: Number(r?.data?.count || items.length || 0) } : r;
}

export async function apiUpsertOrgProjectMember(orgId, projectId, userId, role, options = {}) {
  const oid = String(orgId || "").trim();
  const pid = String(projectId || "").trim();
  const uid = String(userId || "").trim();
  const nextRole = String(role || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  if (!nextRole) return { ok: false, status: 0, error: "missing role" };
  const usePatch = options?.patch === true;
  const endpoint = usePatch
    ? apiRoutes.orgs.projectMember(oid, pid, uid)
    : apiRoutes.orgs.projectMembers(oid, pid);
  const body = usePatch ? { role: nextRole } : { user_id: uid, role: nextRole };
  const method = usePatch ? "PATCH" : "POST";
  const r = okOrError(await request(endpoint, { method, body }));
  return r.ok ? { ok: true, status: r.status, item: r.data || {} } : r;
}

export async function apiDeleteOrgProjectMember(orgId, projectId, userId) {
  const oid = String(orgId || "").trim();
  const pid = String(projectId || "").trim();
  const uid = String(userId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  if (!uid) return { ok: false, status: 0, error: "missing user_id" };
  const endpoint = apiRoutes.orgs.projectMember(oid, pid, uid);
  const r = okOrError(await request(endpoint, { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status, result: r.data || null } : r;
}

// ------- Sessions (legacy / fallback) -------
export async function apiListSessions() {
  if (shouldTraceSessionsFallback()) {
    // eslint-disable-next-line no-console
    console.info("[TRACE_SESSIONS_FALLBACK]", {
      label: "apiListSessions",
      timestamp: Date.now(),
      stack: compactStackMarker(),
    });
  }
  const r = okOrError(await request(apiRoutes.sessions.list()));
  // backend returns {items, count}
  const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, sessions: list, count: Number(r.data?.count || list.length || 0) } : r;
}

export async function apiCreateSession(title, roles, start_role) {
  const t = String(title || "process").trim() || "process";
  const body = { title: t };
  if (roles !== undefined) body.roles = roles;
  if (start_role !== undefined) body.start_role = start_role;

  const r = okOrError(await request(apiRoutes.sessions.create(), { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

export async function apiGetSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.item(id)));
  if (r.ok && r.data && typeof r.data === "object" && String(r.data.error || "").trim()) {
    const detail = String(r.data.error || "not found").trim() || "not found";
    return { ok: false, status: 404, error: detail, data: r.data };
  }
  return r.ok
    ? {
        ok: true,
        status: r.status,
        session: {
          ...(r.data && typeof r.data === "object" ? r.data : {}),
          _sync_source: "get_session",
        },
      }
    : r;
}

export async function apiPatchSession(sessionId, patch) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const patchKeys = patch && typeof patch === "object" ? Object.keys(patch) : [];
  if (shouldLogBpmnTrace()) {
    // eslint-disable-next-line no-console
    console.debug(`[PATCH_SESSION] start sid=${id} payloadKeys=${patchKeys.join(",") || "-"}`);
  }
  const r = okOrError(await request(apiRoutes.sessions.item(id), { method: "PATCH", body: patch || {} }));
  if (shouldLogBpmnTrace()) {
    const xml = String(r?.data?.bpmn_xml || "");
    // eslint-disable-next-line no-console
    console.debug(
      `[PATCH_SESSION] done sid=${id} status=${Number(r?.status || 0)} ok=${r.ok ? 1 : 0} `
      + `resp.bpmn_xml.len=${xml.length} respHash=${fnv1aHex(xml)}`,
    );
  }
  return r.ok
    ? {
        ok: true,
        status: r.status,
        session: {
          ...(r.data && typeof r.data === "object" ? r.data : {}),
          _sync_source: "patch_session",
          _patch_payload_keys: patchKeys,
        },
      }
    : r;
}

export async function apiPutSession(sessionId, body) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.item(id), { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, session: r.data } : r;
}

export async function apiDeleteSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.item(id), { method: "DELETE" }));
}

// ------- Nodes -------
export async function apiCreateNode(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.nodes(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiPatchNode(sessionId, nodeId, patch) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  const r = okOrError(await request(apiRoutes.sessions.node(sid, nid), { method: "POST", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiDeleteNode(sessionId, nodeId) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  return okOrError(await request(apiRoutes.sessions.node(sid, nid), { method: "DELETE" }));
}

// ------- Edges -------
export async function apiCreateEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.edges(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, edge: r.data } : r;
}

export async function apiDeleteEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.edges(sid), { method: "DELETE", body: payload || {} }));
}

// ------- Notes / Answers / AI -------
export async function apiPostNote(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  let body = payload;
  if (typeof payload === "string") {
    body = { notes: payload };
  } else if (!isPlainObject(payload)) {
    body = {};
  }
  const r = okOrError(await request(apiRoutes.sessions.notes(sid), { method: "POST", body }));
  if (!r.ok) return r;
  const session = isPlainObject(r.data) ? { ...r.data } : r.data;
  if (isPlainObject(session) && "notes" in session) {
    session.notes = normalizeNotes(session.notes);
  }
  return { ok: true, status: r.status, session, result: session };
}

export async function apiListNoteThreads(sessionId, filters = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.noteThreads(sid, filters)));
  if (!r.ok) return r;
  const items = Array.isArray(r.data?.items) ? r.data.items : [];
  return {
    ok: true,
    status: r.status,
    items,
    threads: items,
    count: Number(r.data?.count || items.length || 0),
  };
}

function normalizeNoteAggregate(data, fallback = {}) {
  const count = Math.max(0, Number(data?.open_notes_count || 0) || 0);
  return {
    ...fallback,
    ...(isPlainObject(data) ? data : {}),
    open_notes_count: count,
    has_open_notes: Boolean(data?.has_open_notes || count > 0),
  };
}

export async function apiGetSessionNoteAggregate(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.noteAggregate(sid)));
  return r.ok
    ? { ok: true, status: r.status, aggregate: normalizeNoteAggregate(r.data, { scope_type: "session", session_id: sid }) }
    : r;
}

export async function apiGetProjectNoteAggregate(projectId) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(apiRoutes.noteAggregates.project(pid)));
  return r.ok
    ? { ok: true, status: r.status, aggregate: normalizeNoteAggregate(r.data, { scope_type: "project", project_id: pid }) }
    : r;
}

export async function apiGetFolderNoteAggregate(folderId, workspaceId) {
  const fid = String(folderId || "").trim();
  const wid = String(workspaceId || "").trim();
  if (!fid) return { ok: false, status: 0, error: "missing folder_id" };
  if (!wid) return { ok: false, status: 0, error: "missing workspace_id" };
  const r = okOrError(await request(apiRoutes.noteAggregates.folder(fid, wid)));
  return r.ok
    ? { ok: true, status: r.status, aggregate: normalizeNoteAggregate(r.data, { scope_type: "folder", folder_id: fid, workspace_id: wid }) }
    : r;
}

export async function apiCreateNoteThread(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(apiRoutes.sessions.noteThreads(sid), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, thread: r.data?.thread || null } : r;
}

export async function apiAddNoteThreadComment(threadId, payload = {}) {
  const tid = String(threadId || "").trim();
  if (!tid) return { ok: false, status: 0, error: "missing thread_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(apiRoutes.noteThreads.comments(tid), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, thread: r.data?.thread || null } : r;
}

export async function apiPatchNoteThread(threadId, patch = {}) {
  const tid = String(threadId || "").trim();
  if (!tid) return { ok: false, status: 0, error: "missing thread_id" };
  const body = isPlainObject(patch) ? patch : {};
  const r = okOrError(await request(apiRoutes.noteThreads.item(tid), { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, thread: r.data?.thread || null } : r;
}

export async function apiPostAnswer(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.answer(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiPostAnswers(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.answers(sid), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiAiQuestions(sessionId, payload, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.aiQuestions(sid), {
    method: "POST",
    body: payload || {},
    signal: options?.signal,
  }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

function resolveReportOrgId(options = {}) {
  const explicit = String(options?.orgId || "").trim();
  if (explicit) return explicit;
  return String(getActiveOrgId() || "").trim();
}

export async function apiBuildOrgReport(orgId, sessionId, pathId, payload, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const body = isPlainObject(payload) ? { ...payload, path_id: pid } : { path_id: pid };
  const endpoint = apiRoutes.orgs.reportBuild(oid, sid);
  const r = okOrError(await request(endpoint, { method: "POST", body, signal: options?.signal }));
  if (!r.ok) return r;
  const report = isPlainObject(r?.data?.report) ? r.data.report : {};
  const reportId = String(report?.id || "").trim();
  if (!reportId) {
    return {
      ok: false,
      status: Number(r?.status || 502),
      error: "Malformed report create response: missing report.id",
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  return { ok: true, status: r.status, report, result: r.data };
}

export async function apiListOrgReportVersions(orgId, sessionId, pathId, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const endpoint = apiRoutes.orgs.reportVersions(oid, sid, pid, options?.stepsHash || "");
  const r = okOrError(await request(endpoint, { signal: options?.signal }));
  if (!r.ok) return r;
  const items = (Array.isArray(r.data) ? r.data : []).filter((row) => !isUnavailableSyntheticReport(row));
  return { ok: true, status: r.status, items };
}

export async function apiGetOrgReportVersion(orgId, sessionId, reportId, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const rid = String(reportId || "").trim();
  const pid = String(options?.pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const endpoint = apiRoutes.orgs.reportVersion(oid, sid, rid, pid, options?.stepsHash || "");
  const r = okOrError(await request(endpoint, { signal: options?.signal }));
  if (!r.ok) return r;
  return { ok: true, status: r.status, report: r.data || {} };
}

export async function apiDeleteOrgReportVersion(orgId, sessionId, reportId, options = {}) {
  const oid = String(orgId || "").trim();
  const sid = String(sessionId || "").trim();
  const rid = String(reportId || "").trim();
  const pid = String(options?.pathId || "").trim();
  if (!oid) return { ok: false, status: 0, error: "missing org_id" };
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const endpoint = apiRoutes.orgs.reportVersion(oid, sid, rid, pid, options?.stepsHash || "");
  const r = okOrError(await request(endpoint, { method: "DELETE", signal: options?.signal }));
  return r.ok ? { ok: true, status: r.status, result: r.data || null } : r;
}

function isUnavailableSyntheticReport(rowRaw) {
  const row = isPlainObject(rowRaw) ? rowRaw : {};
  const rid = String(row?.id || "").trim().toLowerCase();
  const model = String(row?.model || "").trim().toLowerCase();
  const error = String(row?.error || row?.error_message || "").trim().toLowerCase();
  return rid.startsWith("rpt_local_")
    || model === "unavailable"
    || error.includes("path reports api endpoint is not available");
}

function isRetriablePathReportsStatus(statusRaw) {
  const status = Number(statusRaw || 0);
  return status === 0 || status === 404 || status === 405 || status === 502 || status === 503 || status === 504;
}

function reportPayloadErrorText(payloadRaw) {
  const payload = isPlainObject(payloadRaw) ? payloadRaw : {};
  return String(payload?.error || payload?.detail || payload?.message || "").trim();
}

function reportPayloadErrorStatus(payloadError, fallbackStatus = 400) {
  const marker = String(payloadError || "").toLowerCase();
  if (!marker) return Number(fallbackStatus || 400);
  if (marker.includes("not found") || marker.includes("not_found") || marker.includes("404")) return 404;
  if (marker.includes("unauthorized")) return 401;
  if (marker.includes("forbidden")) return 403;
  if (marker.includes("required") || marker.includes("invalid") || marker.includes("missing")) return 422;
  return Number(fallbackStatus || 400);
}

export async function apiCreatePathReportVersion(sessionId, pathId, payload) {
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const body = isPlainObject(payload) ? payload : {};
  const orgId = resolveReportOrgId();
  let last = null;
  if (orgId) {
    const enterprise = await apiBuildOrgReport(orgId, sid, pid, body);
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }
  const endpoint = apiRoutes.sessions.pathReports(sid, pid);
  const r = okOrError(await request(endpoint, { method: "POST", body }));
  if (!r.ok) {
    if (last && !isRetriablePathReportsStatus(r?.status)) return r;
    return last && !last.ok ? last : r;
  }
  const payloadError = reportPayloadErrorText(r?.data);
  const report = isPlainObject(r?.data?.report) ? r.data.report : {};
  const reportId = String(report?.id || "").trim();
  if (payloadError) {
    return {
      ok: false,
      status: reportPayloadErrorStatus(payloadError, r?.status),
      error: payloadError,
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  if (!reportId) {
    return {
      ok: false,
      status: Number(r?.status || 502),
      error: "Malformed report create response: missing report.id",
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  return { ok: true, status: r.status, report, result: r.data };
}

export async function apiListPathReportVersions(sessionId, pathId, options = {}) {
  const sid = String(sessionId || "").trim();
  const pid = String(pathId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!pid) return { ok: false, status: 0, error: "missing path_id" };
  const orgId = resolveReportOrgId(options);
  let last = null;
  if (orgId) {
    const enterprise = await apiListOrgReportVersions(orgId, sid, pid, options);
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }
  const stepsHash = String(options?.stepsHash || "").trim();
  const endpoint = apiRoutes.sessions.pathReports(sid, pid, stepsHash);
  const r = okOrError(await request(endpoint, { signal: options?.signal }));
  if (!r.ok) return last && !last.ok ? last : r;
  const payloadError = reportPayloadErrorText(r?.data);
  if (payloadError) {
    return {
      ok: false,
      status: reportPayloadErrorStatus(payloadError, r?.status),
      error: payloadError,
      data: r?.data || null,
      method: r?.method,
      endpoint: r?.endpoint || endpoint,
      url: r?.url,
    };
  }
  const items = (Array.isArray(r.data) ? r.data : []).filter((row) => !isUnavailableSyntheticReport(row));
  return { ok: true, status: r.status, items };
}

export async function apiGetReportVersion(reportId, options = {}) {
  const rid = String(reportId || "").trim();
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const sid = String(options?.sessionId || "").trim();
  const pid = String(options?.pathId || "").trim();
  const orgId = resolveReportOrgId(options);
  const isNotFoundPayload = (payload) => {
    if (!isPlainObject(payload)) return false;
    const marker = String(payload?.detail || payload?.error || "").trim().toLowerCase();
    return marker === "not found" || marker.includes("not found");
  };
  let last = null;
  if (orgId && sid) {
    const enterprise = await apiGetOrgReportVersion(orgId, sid, rid, { ...options, pathId: pid });
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }
  if (sid && pid) {
    const scoped = await okOrError(await request(apiRoutes.sessions.pathReport(sid, pid, rid), {
      signal: options?.signal,
    }));
    if (scoped.ok) {
      if (isNotFoundPayload(scoped?.data)) {
        return {
          ok: false,
          status: 404,
          error: String(scoped?.data?.detail || scoped?.data?.error || "not found"),
          data: scoped?.data || null,
          method: scoped?.method,
          endpoint: scoped?.endpoint,
          url: scoped?.url,
          response_text: scoped?.response_text,
          text: scoped?.text,
        };
      }
      return { ok: true, status: scoped.status, report: scoped.data || {} };
    }
    const scopedStatus = Number(scoped?.status || 0);
    if (scopedStatus !== 404 && !isRetriablePathReportsStatus(scopedStatus)) return scoped;
    last = scoped;
  }
  const r = await request(apiRoutes.reports.item(rid), { signal: options?.signal });
  if (r.ok) {
    if (isNotFoundPayload(r?.data)) {
      return {
        ok: false,
        status: 404,
        error: String(r?.data?.detail || r?.data?.error || "not found"),
        data: r?.data || null,
        method: r?.method,
        endpoint: r?.endpoint,
        url: r?.url,
        response_text: r?.response_text,
        text: r?.text,
      };
    }
    return { ok: true, status: r.status, report: r.data || {} };
  }
  if (Number(r?.status || 0) === 404 || isNotFoundPayload(r?.data) || String(r?.error || "").trim().toLowerCase().includes("not found")) {
    return {
      ...r,
      ok: false,
      status: 404,
      error: String(r?.error || r?.data?.detail || r?.data?.error || "not found"),
    };
  }
  last = r;
  if (!isRetriablePathReportsStatus(r?.status) && Number(r?.status || 0) !== 404) return r;
  return last || { ok: false, status: 404, error: "not found" };
}


export async function apiDeleteReportVersion(reportId, options = {}) {
  const rid = String(reportId || "").trim();
  if (!rid) return { ok: false, status: 0, error: "missing report_id" };
  const sid = String(options?.sessionId || "").trim();
  const pid = String(options?.pathId || "").trim();
  const orgId = resolveReportOrgId(options);
  let last = null;
  if (orgId && sid) {
    const enterprise = await apiDeleteOrgReportVersion(orgId, sid, rid, { ...options, pathId: pid });
    if (enterprise?.ok) return enterprise;
    last = enterprise;
    const status = Number(enterprise?.status || 0);
    if (!(status === 0 || status === 404 || status === 405)) return enterprise;
  }

  if (sid && pid) {
    const scoped = okOrError(await request(apiRoutes.sessions.pathReport(sid, pid, rid), {
      method: "DELETE",
      signal: options?.signal,
    }));
    if (scoped.ok) return { ok: true, status: scoped.status, result: scoped.data || null };
    last = scoped;
    const scopedStatus = Number(scoped?.status || 0);
    if (scopedStatus === 405) {
      return {
        ...scoped,
        ok: false,
        unsupported_endpoint: true,
        error: "Delete report endpoint is not available on current backend build",
      };
    }
    if (scopedStatus !== 404 && !isRetriablePathReportsStatus(scopedStatus)) return scoped;
  }
  const r = okOrError(await request(apiRoutes.reports.item(rid), { method: "DELETE", signal: options?.signal }));
  if (r.ok) return { ok: true, status: r.status, result: r.data || null };
  last = r;
  const status = Number(r?.status || 0);
  if (status === 405) {
    return {
      ...r,
      ok: false,
      unsupported_endpoint: true,
      error: "Delete report endpoint is not available on current backend build",
    };
  }
  if (!isRetriablePathReportsStatus(status)) return r;
  return last || { ok: false, status: 404, error: "not found" };
}

export async function apiSessionTitleQuestions(payload) {
  const body = isPlainObject(payload) ? payload : {};
  const title = String(body.title || "").trim();
  if (!title) return { ok: false, status: 0, error: "title is required" };
  const r = okOrError(await request(apiRoutes.llm.sessionTitleQuestions(), { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Derived / Export / Analytics -------
export async function apiRecompute(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.recompute(sid), { method: "POST", body: {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetAnalytics(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.analytics(sid)));
  return r.ok ? { ok: true, status: r.status, analytics: r.data } : r;
}

export async function apiGetBpmnXml(sessionId, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const url = apiRoutes.sessions.bpmn(sid, options);
  const r = okOrError(await request(url));
  return r.ok ? { ok: true, status: r.status, xml: r.text || "" } : r;
}

export async function apiGetBpmnVersions(sessionId, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const url = apiRoutes.sessions.bpmnVersions(sid, options);
  const r = okOrError(await request(url));
  if (!r.ok) return r;
  const payload = r.data && typeof r.data === "object" ? r.data : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    ok: true,
    status: r.status,
    versions: items,
    items,
    count: Number(payload.count || items.length || 0),
    session_id: String(payload.session_id || sid),
  };
}

export async function apiGetBpmnVersion(sessionId, versionId) {
  const sid = String(sessionId || "").trim();
  const vid = String(versionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!vid) return { ok: false, status: 0, error: "missing version_id" };
  const r = okOrError(await request(apiRoutes.sessions.bpmnVersion(sid, vid)));
  if (!r.ok) return r;
  const payload = r.data && typeof r.data === "object" ? r.data : {};
  const item = payload.item && typeof payload.item === "object" ? payload.item : {};
  return {
    ok: true,
    status: r.status,
    item,
    version: item,
    session_id: String(payload.session_id || sid),
  };
}

export async function apiRestoreBpmnVersion(sessionId, versionId) {
  const sid = String(sessionId || "").trim();
  const vid = String(versionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!vid) return { ok: false, status: 0, error: "missing version_id" };
  const r = okOrError(await request(apiRoutes.sessions.bpmnRestore(sid, vid), { method: "POST", body: {} }));
  if (!r.ok) return r;
  const payload = r.data && typeof r.data === "object" ? r.data : {};
  return {
    ok: true,
    status: r.status,
    result: payload,
    session_id: String(payload.session_id || sid),
    bpmn_xml: String(payload.bpmn_xml || ""),
    restored_version: payload.restored_version && typeof payload.restored_version === "object"
      ? payload.restored_version
      : {},
  };
}

export async function apiPutBpmnXml(sessionId, xml, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = { xml: String(xml || "") };
  const rev = Number(options?.rev);
  if (Number.isFinite(rev) && rev >= 0) {
    body.rev = rev;
  }
  const baseDiagramStateVersion = Number(
    options?.baseDiagramStateVersion
    ?? options?.base_diagram_state_version,
  );
  if (Number.isFinite(baseDiagramStateVersion) && baseDiagramStateVersion >= 0) {
    body.base_diagram_state_version = Math.round(baseDiagramStateVersion);
  }
  const reason = String(options?.reason || "").trim().toLowerCase();
  let sourceAction = "";
  if (reason === "import_bpmn") {
    sourceAction = "import_bpmn";
  } else if (reason === "manual_save" || reason.startsWith("manual_save:")) {
    sourceAction = "manual_save";
  } else if (reason === "publish_manual_save" || reason.startsWith("publish_manual_save:")) {
    sourceAction = "publish_manual_save";
  }
  if (sourceAction) {
    body.source_action = sourceAction;
  }
  if (sourceAction === "import_bpmn") {
    const importNote = String(options?.importNote || "").trim();
    if (importNote) body.import_note = importNote;
  }
  const bpmnMeta = options?.bpmnMeta ?? options?.bpmn_meta;
  if (isPlainObject(bpmnMeta)) {
    body.bpmn_meta = bpmnMeta;
  }
  const headers = {};
  if (options?.ifMatch !== undefined && options?.ifMatch !== null) {
    headers["If-Match"] = String(options.ifMatch);
  }
  const r = okOrError(await request(apiRoutes.sessions.bpmn(sid), { method: "PUT", body, headers }));
  if (!r.ok) return r;
  const storedRev = Number(r?.data?.version);
  const diagramStateVersion = Number(r?.data?.diagram_state_version);
  const bpmnVersionSnapshot = r?.data?.bpmn_version_snapshot && typeof r.data.bpmn_version_snapshot === "object"
    ? r.data.bpmn_version_snapshot
    : null;
  return {
    ok: true,
    status: r.status,
    result: r.data,
    storedRev: Number.isFinite(storedRev) ? storedRev : (Number.isFinite(rev) ? rev : 0),
    diagramStateVersion: Number.isFinite(diagramStateVersion) ? Math.round(diagramStateVersion) : 0,
    bpmnVersionSnapshot,
  };
}

export async function apiDeleteBpmnXml(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.bpmn(sid), { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetBpmnMeta(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.bpmnMeta(sid)));
  return r.ok ? { ok: true, status: r.status, meta: r.data || { version: 1, flow_meta: {}, node_path_meta: {} } } : r;
}

export async function apiPatchBpmnMeta(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(apiRoutes.sessions.bpmnMeta(sid), { method: "PATCH", body }));
  return r.ok ? { ok: true, status: r.status, meta: r.data || { version: 1, flow_meta: {}, node_path_meta: {} } } : r;
}

export async function apiInferBpmnRtiers(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(apiRoutes.sessions.inferRtiers(sid), { method: "POST", body }));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    meta: data.meta || { version: 1, flow_meta: {}, node_path_meta: {} },
    inference: data.inference || {},
  };
}

export async function apiStartAutoPass(sessionId, payload = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const buildPath = apiRoutes?.sessions?.autoPass;
  if (typeof buildPath !== "function") {
    return { ok: false, status: 0, error: "auto-pass route builder is missing" };
  }
  const body = isPlainObject(payload) ? payload : {};
  const r = okOrError(await request(buildPath(sid), { method: "POST", body }));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    job_id: String(data.job_id || "").trim(),
    job_status: String(data.status || "").trim().toLowerCase(),
    progress: Number(data.progress || 0),
    result: isPlainObject(data.result) ? data.result : null,
    execution: String(data.execution || "").trim(),
    error_code: String(data.error_code || "").trim(),
    error_message: String(data.error_message || "").trim(),
    data,
  };
}

export async function apiGetAutoPassPrecheck(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const buildPath = apiRoutes?.sessions?.autoPassPrecheck;
  if (typeof buildPath !== "function") {
    // Backward compatibility guard: precheck route is optional.
    // eslint-disable-next-line no-console
    console.warn("[api] autoPassPrecheck route builder is missing; precheck skipped");
    return {
      ok: true,
      status: 200,
      can_run: true,
      code: "PRECHECK_UNAVAILABLE",
      message: "",
      main_start_event_ids: [],
      main_end_event_ids: [],
      data: {},
    };
  }
  const r = okOrError(await request(buildPath(sid)));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    can_run: data.ok === true,
    code: String(data.code || "").trim(),
    message: String(data.message || "").trim(),
    main_start_event_ids: Array.isArray(data.main_start_event_ids) ? data.main_start_event_ids : [],
    main_end_event_ids: Array.isArray(data.main_end_event_ids) ? data.main_end_event_ids : [],
    data,
  };
}

export async function apiGetAutoPassStatus(sessionId, jobId) {
  const sid = String(sessionId || "").trim();
  const jid = String(jobId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!jid) return { ok: false, status: 0, error: "missing job_id" };
  const buildPath = apiRoutes?.sessions?.autoPass;
  if (typeof buildPath !== "function") {
    return { ok: false, status: 0, error: "auto-pass route builder is missing" };
  }
  const r = okOrError(await request(buildPath(sid, { job_id: jid })));
  if (!r.ok) return r;
  const data = isPlainObject(r.data) ? r.data : {};
  return {
    ok: true,
    status: r.status,
    job_id: String(data.job_id || jid).trim(),
    job_status: String(data.status || "").trim().toLowerCase(),
    progress: Number(data.progress || 0),
    result: isPlainObject(data.result) ? data.result : null,
    error: String(data.error || "").trim(),
    error_code: String(data.error_code || "").trim(),
    error_message: String(data.error_message || "").trim(),
    data,
  };
}

export async function apiGetExport(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.export(sid)));
  return r.ok ? { ok: true, status: r.status, export: r.data } : r;
}

// ------- LLM Settings -------
export async function apiGetLlmSettings() {
  const r = okOrError(await request(apiRoutes.llm.settings()));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiPostLlmSettings(payload) {
  const r = okOrError(await request(apiRoutes.llm.settings(), { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiVerifyLlmSettings(payload) {
  const r = okOrError(await request(apiRoutes.llm.verify(), { method: "POST", body: payload || {} }));
  if (!r.ok && Number(r.status) === 404) {
    return {
      ok: false,
      status: 404,
      error: "Endpoint /api/settings/llm/verify не найден. Перезапустите backend с последними изменениями.",
      needs_backend_restart: true,
    };
  }
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- DEV helpers -------
export async function apiWipeDevAll() {
  const lp = await apiListProjects();
  if (!lp.ok) return lp;

  const projects = Array.isArray(lp.projects) ? lp.projects : Array.isArray(lp.items) ? lp.items : [];
  let deleted = 0;

  for (const p of projects) {
    const id = String((p && (p.id || p.project_id)) || "").trim();
    if (!id) continue;
    const r = await apiDeleteProject(id);
    if (!r.ok) return r;
    deleted += 1;
  }

  return { ok: true, status: 200, deleted };
}
