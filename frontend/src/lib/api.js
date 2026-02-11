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
