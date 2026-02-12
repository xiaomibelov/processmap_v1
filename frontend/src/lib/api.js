const API_BASE = "/api";

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function okResult(data, status) { return { ok: true, status, ...data }; }
function failResult(status, message, details) { return { ok: false, status, message, details }; }

async function requestJson(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await safeJson(res);
    if (!res.ok) return failResult(res.status, (data && (data.message || data.error?.message)) || `HTTP ${res.status}`, data);
    return okResult({ data }, res.status);
  } catch (e) {
    return failResult(0, "Сеть/прокси недоступны (проверь backend и Vite proxy).", String(e));
  }
}

async function requestText(method, path) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Accept": "text/plain, application/xml, text/xml, */*" },
    });
    const text = await res.text();
    if (!res.ok) return failResult(res.status, `HTTP ${res.status}`, text);
    return okResult({ text }, res.status);
  } catch (e) {
    return failResult(0, "Сеть/прокси недоступны (проверь backend и Vite proxy).", String(e));
  }
}

export async function apiMeta() {
  const r = await requestJson("GET", "/meta");
  return r.ok ? okResult({ meta: r.data }, r.status) : r;
}

export async function apiListSessions() {
  const r = await requestJson("GET", "/sessions");
  if (!r.ok) return r;
  const sessions = Array.isArray(r.data) ? r.data : (r.data?.sessions || []);
  return okResult({ sessions }, r.status);
}

export async function apiCreateSession(payload) {
  const r = await requestJson("POST", "/sessions", payload || {});
  if (!r.ok) return r;
  const s = r.data;
  const session_id = s?.session_id || s?.id || s?.session?.session_id || s?.session?.id || null;
  return okResult({ session: s, session_id }, r.status);
}

export async function apiGetSession(id) {
  const r = await requestJson("GET", `/sessions/${encodeURIComponent(id)}`);
  return r.ok ? okResult({ session: r.data }, r.status) : r;
}

export async function apiSaveSession(id, sessionShape) {
  const r = await requestJson("PATCH", `/sessions/${encodeURIComponent(id)}`, sessionShape || {});
  return r.ok ? okResult({ session: r.data }, r.status) : r;
}

export async function apiPostNote(id, note) {
  const payload =
    typeof note === "string" ? { text: note } :
    (note && typeof note === "object" ? note : { text: String(note || "") });

  const r = await requestJson("POST", `/sessions/${encodeURIComponent(id)}/notes`, payload);
  return r.ok ? okResult({ note_result: r.data }, r.status) : r;
}

export async function apiGetBpmn(id) {
  return requestText("GET", `/sessions/${encodeURIComponent(id)}/bpmn`);
}
