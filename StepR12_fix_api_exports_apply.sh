#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r12-api-exports-v1"
TAG_START="cp/foodproc_frontend_r12_api_exports_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r12_api_exports_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r12_api_exports_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R12 api exports start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_START"

echo
echo "== git (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== branch =="
git switch -c "$BR" >/dev/null 2>&1 || git switch "$BR" >/dev/null
git status -sb || true

echo
echo "== unstage helper scripts/artifacts if any =="
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged Run_StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true

echo
echo "== write frontend/src/lib/api.js (restore named exports used by App.jsx + keep apiSaveSession) =="
mkdir -p frontend/src/lib

cat > frontend/src/lib/api.js <<'EOF'
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
EOF

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== commit (frontend only) =="
git add -A frontend/src/lib/api.js
git status -sb || true
git commit -m "fix(frontend): restore api.js named exports (sessions/meta/notes) + keep apiSaveSession" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R12 api exports done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend/src/lib/api.js >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
