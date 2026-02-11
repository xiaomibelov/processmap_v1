async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });
  return res;
}

export async function apiListSessions() {
  try {
    const res = await apiFetch("/api/sessions", { method: "GET" });
    if (!res.ok) return { ok: false, sessions: [], status: res.status };
    const data = await res.json();
    return { ok: true, sessions: Array.isArray(data) ? data : [], status: res.status };
  } catch {
    return { ok: false, sessions: [], status: 0 };
  }
}

export async function apiCreateSession({ title } = {}) {
  try {
    const res = await apiFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: title || "" }),
    });
    if (!res.ok) return { ok: false, session_id: "", status: res.status };
    const data = await res.json().catch(() => ({}));
    const session_id = typeof data.session_id === "string" ? data.session_id : "";
    return { ok: Boolean(session_id), session_id, status: res.status };
  } catch {
    return { ok: false, session_id: "", status: 0 };
  }
}

export async function apiGetSession(sessionId) {
  if (!sessionId) return { ok: false, session: null, status: 0 };
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
    if (!res.ok) return { ok: false, session: null, status: res.status };
    const data = await res.json().catch(() => null);
    return { ok: true, session: data, status: res.status };
  } catch {
    return { ok: false, session: null, status: 0 };
  }
}

export async function apiPostNote(sessionId, { text, ts, author } = {}) {
  if (!sessionId) return { ok: false, status: 0 };
  try {
    const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/notes`, {
      method: "POST",
      body: JSON.stringify({
        text: text || "",
        ts: ts || undefined,
        author: author || undefined,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/*
 * apiSaveSession export (frontend)
 * Purpose: persist whole session draft (roles/start_role/notes/nodes/edges/...) into backend.
 * Backend may accept PATCH or PUT; we try PATCH first then fall back to PUT on 405.
 */
export async function apiSaveSession(sessionId, payload) {
  const id = encodeURIComponent(String(sessionId || ""));
  const url = `/api/sessions/${id}`;

  async function send(method) {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });

    if (res.ok) return { ok: true, status: res.status, method };
    return { ok: false, status: res.status, method };
  }

  try {
    const r1 = await send("PATCH");
    if (r1.ok) return r1;
    if (r1.status === 405) {
      const r2 = await send("PUT");
      return r2;
    }
    return r1;
  } catch {
    return { ok: false, status: 0, method: "PATCH" };
  }
}
