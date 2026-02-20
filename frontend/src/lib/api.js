// Single source of truth for API calls (FPC)
// Uses Vite proxy: /api -> backend, so API_BASE is empty.
const API_BASE = "";

function joinUrl(path) {
  const p = String(path || "");
  return `${API_BASE}${p}`;
}

function normalizeErrorPayload(payload) {
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

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x) && !(x instanceof FormData) && !(x instanceof Blob);
}

function normalizeNotes(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    // keep as plain legacy text note
  }
  return [{ note_id: "legacy", ts: null, author: null, text }];
}

function okOrError(r) {
  if (!r.ok) return r;
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data) && r.data.error) {
    return { ok: false, status: r.status || 200, error: String(r.data.error), data: r.data };
  }
  return r;
}

async function request(path, opts = {}) {
  const url = joinUrl(path);
  const method = String(opts.method || "GET").toUpperCase();

  const headers = new Headers(opts.headers || {});
  const hasBody = opts.body !== undefined && opts.body !== null;

  let body = opts.body;
  if (hasBody && isPlainObject(body)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: hasBody ? body : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e || "network error") };
  }

  const status = res.status;
  const ct = String(res.headers.get("content-type") || "");

  let data = null;
  let text = "";

  try {
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      text = await res.text();
    }
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    const err = normalizeErrorPayload(data) || text || `HTTP ${status}`;
    return { ok: false, status, error: err, data };
  }

  return { ok: true, status, data, text };
}

function shouldLogBpmnTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ------- Meta -------
export async function apiMeta() {
  const r = okOrError(await request("/api/meta"));
  return r.ok ? { ok: true, status: r.status, meta: r.data } : r;
}

// ------- Glossary -------
export async function apiGlossaryAdd(payload) {
  const r = okOrError(await request("/api/glossary/add", { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Projects -------
export async function apiListProjects() {
  const r = okOrError(await request("/api/projects"));
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

  const r = okOrError(await request("/api/projects", { method: "POST", body }));
  if (!r.ok) return r;

  const project_id = String(r.data?.id || r.data?.project_id || "").trim();
  return { ok: true, status: r.status, project_id, project: r.data };
}

export async function apiGetProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(id)}`));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPatchProject(projectId, patch) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiPutProject(projectId, body) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, project: r.data } : r;
}

export async function apiDeleteProject(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing project_id" };
  return okOrError(await request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ------- Project Sessions -------
export async function apiListProjectSessions(projectId, mode) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const qs = m ? `?mode=${encodeURIComponent(m)}` : "";
  const r = okOrError(await request(`/api/projects/${encodeURIComponent(pid)}/sessions${qs}`));
  const list = Array.isArray(r.data) ? r.data : [];
  return r.ok ? { ok: true, status: r.status, sessions: list } : r;
}

export async function apiCreateProjectSession(projectId, mode, title, roles, start_role, ai_prep_questions) {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, status: 0, error: "missing project_id" };

  const m = String(mode || "").trim();
  const qs = m ? `?mode=${encodeURIComponent(m)}` : "";
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

  const r = okOrError(await request(`/api/projects/${encodeURIComponent(pid)}/sessions${qs}`, { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

// ------- Sessions (legacy / fallback) -------
export async function apiListSessions() {
  const r = okOrError(await request("/api/sessions"));
  // backend returns {items, count}
  const list = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.items) ? r.data.items : [];
  return r.ok ? { ok: true, status: r.status, sessions: list, count: Number(r.data?.count || list.length || 0) } : r;
}

export async function apiCreateSession(title, roles, start_role) {
  const t = String(title || "process").trim() || "process";
  const body = { title: t };
  if (roles !== undefined) body.roles = roles;
  if (start_role !== undefined) body.start_role = start_role;

  const r = okOrError(await request("/api/sessions", { method: "POST", body }));
  if (!r.ok) return r;

  const session_id = String(r.data?.id || r.data?.session_id || "").trim();
  return { ok: true, status: r.status, session_id, session: r.data };
}

export async function apiGetSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: patch || {} }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "PUT", body: body || {} }));
  return r.ok ? { ok: true, status: r.status, session: r.data } : r;
}

export async function apiDeleteSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ------- Nodes -------
export async function apiCreateNode(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/nodes`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiPatchNode(sessionId, nodeId, patch) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/nodes/${encodeURIComponent(nid)}`, { method: "POST", body: patch || {} }));
  return r.ok ? { ok: true, status: r.status, node: r.data } : r;
}

export async function apiDeleteNode(sessionId, nodeId) {
  const sid = String(sessionId || "").trim();
  const nid = String(nodeId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  if (!nid) return { ok: false, status: 0, error: "missing node_id" };
  return okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/nodes/${encodeURIComponent(nid)}`, { method: "DELETE" }));
}

// ------- Edges -------
export async function apiCreateEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/edges`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, edge: r.data } : r;
}

export async function apiDeleteEdge(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/edges`, { method: "DELETE", body: payload || {} }));
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
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/notes`, { method: "POST", body }));
  if (!r.ok) return r;
  const session = isPlainObject(r.data) ? { ...r.data } : r.data;
  if (isPlainObject(session) && "notes" in session) {
    session.notes = normalizeNotes(session.notes);
  }
  return { ok: true, status: r.status, session, result: session };
}

export async function apiPostAnswer(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/answer`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiPostAnswers(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/answers`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiAiQuestions(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/ai/questions`, { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiSessionTitleQuestions(payload) {
  const body = isPlainObject(payload) ? payload : {};
  const title = String(body.title || "").trim();
  if (!title) return { ok: false, status: 0, error: "title is required" };
  const r = okOrError(await request("/api/llm/session-title/questions", { method: "POST", body }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

// ------- Derived / Export / Analytics -------
export async function apiRecompute(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/recompute`, { method: "POST", body: {} }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetAnalytics(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/analytics`));
  return r.ok ? { ok: true, status: r.status, analytics: r.data } : r;
}

export async function apiGetBpmnXml(sessionId, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const params = new URLSearchParams();
  if (options?.raw === true) params.set("raw", "1");
  if (options?.includeOverlay === false) params.set("include_overlay", "0");
  if (options?.cacheBust === true) params.set("_ts", String(Date.now()));
  const qs = params.toString();
  const url = `/api/sessions/${encodeURIComponent(sid)}/bpmn${qs ? `?${qs}` : ""}`;
  const r = okOrError(await request(url));
  return r.ok ? { ok: true, status: r.status, xml: r.text || "" } : r;
}

export async function apiPutBpmnXml(sessionId, xml, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = { xml: String(xml || "") };
  const rev = Number(options?.rev);
  if (Number.isFinite(rev) && rev >= 0) {
    body.rev = rev;
  }
  const headers = {};
  if (options?.ifMatch !== undefined && options?.ifMatch !== null) {
    headers["If-Match"] = String(options.ifMatch);
  }
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn`, { method: "PUT", body, headers }));
  if (!r.ok) return r;
  const storedRev = Number(r?.data?.version);
  return {
    ok: true,
    status: r.status,
    result: r.data,
    storedRev: Number.isFinite(storedRev) ? storedRev : (Number.isFinite(rev) ? rev : 0),
  };
}

export async function apiDeleteBpmnXml(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/bpmn`, { method: "DELETE" }));
  return r.ok ? { ok: true, status: r.status, result: r.data } : r;
}

export async function apiGetExport(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(`/api/sessions/${encodeURIComponent(sid)}/export`));
  return r.ok ? { ok: true, status: r.status, export: r.data } : r;
}

// ------- LLM Settings -------
export async function apiGetLlmSettings() {
  const r = okOrError(await request("/api/settings/llm"));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiPostLlmSettings(payload) {
  const r = okOrError(await request("/api/settings/llm", { method: "POST", body: payload || {} }));
  return r.ok ? { ok: true, status: r.status, settings: r.data } : r;
}

export async function apiVerifyLlmSettings(payload) {
  const r = okOrError(await request("/api/settings/llm/verify", { method: "POST", body: payload || {} }));
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
