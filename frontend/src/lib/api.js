async function parseResponse(res, path, method) {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function apiGet(path) {
  const res = await fetch(path, { credentials: "include" });
  return parseResponse(res, path, "GET");
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(res, path, "POST");
}

export async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(res, path, "PATCH");
}

export async function apiPut(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(res, path, "PUT");
}

/* ---- Named exports consumed by the app (stable surface) ---- */

export async function apiMeta() {
  return apiGet("/api/meta");
}

export async function apiListSessions() {
  return apiGet("/api/sessions");
}

export async function apiCreateSession(payload) {
  return apiPost("/api/sessions", payload ?? {});
}

export async function apiGetSession(sessionId) {
  const id = encodeURIComponent(sessionId);
  return apiGet(`/api/sessions/${id}`);
}

export async function apiPostNote(sessionId, text) {
  const id = encodeURIComponent(sessionId);
  return apiPost(`/api/sessions/${id}/notes`, { text: String(text ?? "") });
}

/**
 * Write-path used by Graph Editor and later Copilot.
 * Backend supports PATCH today; for "replace whole session" we'll converge to PUT later.
 */
export async function apiSaveSession(sessionId, partial) {
  const id = encodeURIComponent(sessionId);
  return apiPatch(`/api/sessions/${id}`, partial ?? {});
}
