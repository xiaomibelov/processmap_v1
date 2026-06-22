# Contour: stage1/test-e2e-smoke-20260613T074137Z

## 1. Objective
Run a focused, read-only smoke verification of the ProcessMap frontend e2e harness on the current checkout. Confirm source/runtime truth, verify the dev server is reachable, and execute a single lightweight end-to-end spec (`workspace-dashboard-smoke.spec.mjs`) to prove the e2e tooling, Playwright, and baseline runtime are healthy. No product code is changed.

## 2. Bounded Scope
- **In scope:**
  - Source truth capture (`git branch`, `HEAD`, `git status -sb`).
  - Runtime availability checks for backend (`:8011`) and frontend (`:5177`).
  - Playwright harness health check.
  - Execution of `frontend/e2e/workspace-dashboard-smoke.spec.mjs` against `http://127.0.0.1:5177`.
  - Collection of test output and console evidence.
- **Out of scope:**
  - Product code changes.
  - Merge / deploy / PR.
  - Additional e2e specs beyond the single smoke spec.
  - Backend API functional changes.

## 3. UI/UX Guidelines Applied
- This is a test/validation contour; no UI changes are made.
- The spec must complete without Playwright timeout or unhandled runtime errors.

## 4. Acceptance Criteria
| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Source/runtime truth captured | `git branch`, `HEAD`, `git status -sb`, runtime URLs recorded in `RUNTIME_PROOF_CHECKLIST.md` |
| 2 | Backend is reachable | `curl -I ${E2E_API_BASE_URL}/api/health` returns HTTP 200 |
| 3 | Frontend is reachable | `curl -I ${E2E_APP_BASE_URL}` returns HTTP 200 |
| 4 | Playwright browsers are installed | `npx playwright install chromium webkit` completes without error |
| 5 | Smoke spec passes | `npx playwright test frontend/e2e/workspace-dashboard-smoke.spec.mjs --workers=1 --reporter=list` passes |
| 6 | No critical console errors | `error`/`warning` levels collected; no unhandled `TypeError`/`ReferenceError` |

## 5. Execution Steps
1. Capture source truth (`git branch --show-current`, `git rev-parse HEAD`, `git status -sb`).
2. Verify runtime endpoints (`curl -I`) for backend and frontend; report `BLOCKED` if missing.
3. Ensure Playwright browsers are installed.
4. Run the smoke spec:
   ```bash
   cd frontend && E2E_BROWSER=webkit npx playwright test e2e/workspace-dashboard-smoke.spec.mjs --workers=1 --reporter=list
   ```
5. Collect test output and console logs.
6. Update `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md`.
7. Update `STATE.json` with `worker_status`.

## 6. Context Sources
- Project e2e README: `frontend/e2e/README.md`
- Target spec: `frontend/e2e/workspace-dashboard-smoke.spec.mjs`

## 7. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Backend/frontend not running | Worker must start services per `frontend/e2e/README.md` or mark `BLOCKED` |
| Playwright browser not installed | Run `npx playwright install chromium webkit` before tests |
| Smoke spec requires auth | Use existing storage state or login helper; if unavailable, document and mark `BLOCKED` |
| UI-UX skill unavailable | Not needed; this is a test contour |

## 8. Handoff Marker
Agent 2 waits for: `READY_FOR_EXECUTION` file present in `.planning/contours/stage1/test-e2e-smoke-20260613T074137Z/`
