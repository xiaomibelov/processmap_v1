import { requestJson, requestText, normalizeList, pickId, str } from "./http";

function normalizeRoles(x) {
  const arr = Array.isArray(x) ? x : [];
  return arr
    .map((r) => {
      if (typeof r === "string") return str(r);
      if (r && typeof r === "object") return str(r.title || r.name || r.label || r.id);
      return "";
    })
    .filter(Boolean);
}

export async function apiListSessions() {
  const r = await requestJson("/api/sessions");
  if (!r.ok) return r;

  const list = normalizeList(r.data, ["sessions", "items", "data"]);
  return { ok: true, sessions: list.length ? list : normalizeList(r.data, ["results"]) };
}

export async function apiCreateSession(modeOrPayload) {
  // OpenAPI требует title. mode у тебя пока концепт на фронте, поэтому title = Session(mode)
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

  const r = await requestJson("/api/sessions", { method: "POST", body });
  if (!r.ok) return r;

  const session_id = pickId(r.data) || str(r.data?.session_id);
  return { ok: true, session_id, data: r.data };
}

export async function apiGetSession(sessionId) {
  const sid = str(sessionId);
  const r = await requestJson(`/api/sessions/${sid}`);
  if (!r.ok) return r;

  const s = r.data || {};
  return {
    ok: true,
    session: {
      ...s,
      session_id: str(s.session_id || s.id || sid),
      roles: normalizeRoles(s.roles),
      start_role: str(s.start_role),
      notes: s.notes ?? [],
      nodes: s.nodes ?? [],
      edges: s.edges ?? [],
      questions: s.questions ?? [],
      title: str(s.title),
    },
  };
}

export async function apiPatchSession(sessionId, patch) {
  const sid = str(sessionId);

  const body = { ...(patch || {}) };
  if (body.roles !== undefined) body.roles = normalizeRoles(body.roles);
  if (body.start_role !== undefined) body.start_role = str(body.start_role);

  const r = await requestJson(`/api/sessions/${sid}`, { method: "PATCH", body });
  if (!r.ok) return r;
  return { ok: true, session: r.data };
}

export async function apiPutSession(sessionId, payload) {
  const sid = str(sessionId);
  const r = await requestJson(`/api/sessions/${sid}`, { method: "PUT", body: payload || {} });
  if (!r.ok) return r;
  return { ok: true, session: r.data };
}

export async function apiPostNote(sessionId, textOrPayload) {
  const sid = str(sessionId);

  // compatibility: accept string OR {text} OR {notes}
  const t =
    typeof textOrPayload === "string"
      ? str(textOrPayload)
      : str(textOrPayload?.notes || textOrPayload?.text);

  const body = { notes: t };

  const r = await requestJson(`/api/sessions/${sid}/notes`, { method: "POST", body });
  if (!r.ok) return r;
  return { ok: true, data: r.data };
}

export async function apiGetBpmnXml(sessionId) {
  const sid = str(sessionId);
  const r = await requestText(`/api/sessions/${sid}/bpmn`);
  if (!r.ok) return r;
  return { ok: true, text: r.text };
}

export async function apiRecompute(sessionId) {
  const sid = str(sessionId);
  const r = await requestJson(`/api/sessions/${sid}/recompute`, { method: "POST" });
  if (!r.ok) return r;
  return { ok: true, data: r.data };
}

export async function apiGetAnalytics(sessionId) {
  const sid = str(sessionId);
  const r = await requestJson(`/api/sessions/${sid}/analytics`);
  if (!r.ok) return r;
  return { ok: true, data: r.data };
}

export async function apiAiQuestions(sessionId, payload) {
  const sid = str(sessionId);
  const body = {
    mode: str(payload?.mode || "quick_skeleton"),
    limit: Number(payload?.limit ?? 8),
  };
  const r = await requestJson(`/api/sessions/${sid}/ai/questions`, { method: "POST", body });
  if (!r.ok) return r;
  return { ok: true, data: r.data };
}

export async function apiAnswer(sessionId, payload) {
  const sid = str(sessionId);
  const body = {
    question_id: str(payload?.question_id),
    answer: str(payload?.answer),
    node_id: payload?.node_id == null ? null : str(payload?.node_id),
  };
  const r = await requestJson(`/api/sessions/${sid}/answer`, { method: "POST", body });
  if (!r.ok) return r;
  return { ok: true, data: r.data };
}
