#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r10-apiSaveSession-export-v1"
TAG_START="cp/foodproc_frontend_r10_api_fix_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r10_api_fix_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r10_api_fix_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R10 api fix start (${TS})" >/dev/null 2>&1 || true
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
echo "== guard: frontend-only (stash backend changes if any) =="
if git diff --name-only | grep -q '^backend/'; then
  echo "backend changes detected -> stashing only backend/"
  git stash push -u -m "WIP backend (auto-stash before frontend api fix) ${TS}" -- backend >/dev/null 2>&1 || true
else
  echo "no backend changes"
fi

echo
echo "== ensure api.js exports apiSaveSession =="
API_JS="frontend/src/lib/api.js"
if [ ! -f "$API_JS" ]; then
  echo "BLOCKER: missing $API_JS"
  echo "You need to add frontend/src/lib/api.js first."
  false
fi

if grep -qE 'export\s+(async\s+)?function\s+apiSaveSession\b' "$API_JS"; then
  echo "ok: apiSaveSession already exported"
else
  echo "patch: append apiSaveSession export"
  cat >> "$API_JS" <<'EOF'

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
EOF
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "fix(frontend): export apiSaveSession wrapper for session PATCH/PUT" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R10 api fix done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
