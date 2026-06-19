# Contour: stage8/test-devserver-1781309535

## 1. Objective
Run a bounded smoke test to verify that the ProcessMap frontend dev server is reachable on `http://localhost:5177/` and is serving the current build with the expected no-cache response headers. This is an environment-dependent validation contour; an unreachable server is reported explicitly but is not treated as a product defect.

## 2. Bounded Scope
- **In scope:**
  - HTTP reachability of `http://localhost:5177/`
  - HTTP status line and `Date` header freshness
  - `index.html` response body presence and content-type
  - Cache-control headers (`no-cache, no-store, must-revalidate`)
  - Source/runtime truth capture
  - Recording evidence in `RUNTIME_PROOF_CHECKLIST.md`
- **Out of scope:**
  - Product code changes of any kind
  - Starting, restarting, or configuring the dev server if it is not running
  - Backend API functional tests
  - Playwright/e2e spec execution
  - Merge / deploy / PR
  - Performance or load testing

## 3. UI/UX Guidelines Applied
- This is a runtime validation contour; no UI changes are made.
- The dev server must return current `index.html` (not a stale cached copy).
- Response must include anti-cache headers consistent with the nginx/dev server configuration.

## 4. Acceptance Criteria
| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Source/runtime truth captured | `git branch --show-current`, `git rev-parse HEAD`, `git status -sb` recorded in `RUNTIME_PROOF_CHECKLIST.md` |
| 2 | Dev server is reachable | `curl -I --max-time 5 http://localhost:5177/` returns HTTP 200 |
| 3 | Response contains `Date` header | Recorded verbatim in `RUNTIME_PROOF_CHECKLIST.md` |
| 4 | Response contains expected cache headers | `Cache-Control: no-cache, no-store, must-revalidate` (or equivalent) present |
| 5 | `index.html` is served | `Content-Type: text/html` and non-empty body on `GET /` |
| 6 | Evidence is persisted | `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md` are complete |
| 7 | State is updated | `STATE.json` reflects `worker_status` after execution |

## 5. Execution Steps
1. Capture source truth (`git branch --show-current`, `git rev-parse HEAD`, `git status -sb`).
2. Probe the dev server with a HEAD request: `curl -I --max-time 5 http://localhost:5177/`.
3. If unreachable, record the failure verbatim and set `worker_status` to `complete` with a clear environment note (do **not** modify product code or start the server).
4. If reachable, capture the full status line, `Date`, `Content-Type`, `Content-Length`, and `Cache-Control` headers.
5. Run a GET request: `curl -sf --max-time 5 http://localhost:5177/` and record that `index.html` body is returned.
6. Fill `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md`.
7. Update `STATE.json` with `worker_status: "complete"` (or `"blocked"` if runtime is missing and cannot be verified).

## 6. Context Sources
- Stage 8 smoke test script: `.agents/tests/test_stage8_dev_server.sh`
- Frontend package manifest: `frontend/package.json`
- Dev server / reverse-proxy config: `deploy/nginx/default.conf`
- Container mapping note: `/app` in the test container maps to `/opt/processmap-test/frontend` on the host.

## 7. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Dev server not running | Report environment-dependent unreachable status; do not patch product code or start it |
| Stale build served | Compare `Date` header to current UTC; if older than ~1 minute, note it explicitly |
| `curl` unavailable or blocked | Use `wget -S -O /dev/null` as fallback; record tool used |
| nginx reverse-proxy vs. Vite dev server difference | Record which server string is returned (`Server` header) |

## 8. Handoff Marker
Agent 2 waits for: `READY_FOR_EXECUTION` directory present in `.planning/contours/stage8/test-devserver-1781309535/`
