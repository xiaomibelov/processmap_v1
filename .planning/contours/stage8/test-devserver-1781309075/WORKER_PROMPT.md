# Worker Prompt: stage8/test-devserver-1781309075

## Goal

Execute the bounded runtime smoke test described in `PLAN.md`: verify that the ProcessMap frontend dev server is reachable on `http://localhost:5177/` and serves `index.html` with the expected no-cache headers. Do not edit product code, do not start the server, do not merge/push/PR.

## Source Truth Commands

Run before any runtime probe:

```bash
cd /opt/processmap-test
git fetch origin
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

Record the output in `RUNTIME_PROOF_CHECKLIST.md`.

## Container Mapping Note

In the test container, `/app` maps to `/opt/processmap-test/frontend` on the host. The dev server URL remains `http://localhost:5177/` from the host or container perspective used by this contour.

## Scope

- Read `PLAN.md`.
- Probe `http://localhost:5177/` using `curl` (fallback `wget`).
- Capture response headers and body evidence.
- Write `EXEC_REPORT.md`.
- Fill `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md`.
- Update `STATE.json`.

## Non-goals

- No edits to product frontend/backend code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- Do **not** start, restart, or reconfigure the dev server if it is unreachable; record the environment state instead.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Probe the dev server:
   ```bash
   curl -I --max-time 5 http://localhost:5177/ 2>&1
   ```
   If `curl` is unavailable, use:
   ```bash
   wget -S -O /dev/null http://localhost:5177/ 2>&1
   ```
4. If reachable, capture:
   - Full HTTP status line
   - `Date` header verbatim
   - `Server` header
   - `Content-Type`
   - `Content-Length`
   - `Cache-Control`, `Pragma`, `Expires`
5. Verify the response body:
   ```bash
   curl -sf --max-time 5 http://localhost:5177/ 2>&1 | head -c 2000
   ```
   Confirm it is non-empty HTML.
6. Fill `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md` in `.planning/contours/stage8/test-devserver-1781309075/`.
7. Write `EXEC_REPORT.md` in `.planning/contours/stage8/test-devserver-1781309075/` with:
   - Source truth at execution time
   - Commands run
   - Full command output
   - Header/body evidence
   - Runtime proof status
   - Explicit unchanged areas
   - Remaining risks / environment notes
8. Update `STATE.json`:
   - Set `state` to `"complete"` if the probe succeeded.
   - Set `state` to `"blocked"` only if the server is unreachable and the environment cannot be verified (do not treat unreachable as a product defect).
   - Update `updated_at` and `worker_status` fields.
9. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Verification is the runtime probe itself. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

- `RUNTIME_PROOF_CHECKLIST.md` must contain checked evidence items.
- `RUNTIME_NAVIGATION.md` must describe the single HTTP endpoint probed and any fallback tool used.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Commands run and their output
- Header/body evidence
- Runtime proof status
- Explicit unchanged areas
- Remaining risks

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
