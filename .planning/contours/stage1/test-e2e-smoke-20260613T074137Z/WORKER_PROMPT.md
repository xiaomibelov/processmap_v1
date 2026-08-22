# Agent 2 (Worker) — Contour: stage1/test-e2e-smoke-20260613T074137Z

## Mission
Execute the bounded e2e smoke verification plan in `PLAN.md`. You are the sole Worker; there is no other Agent 2.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` fully
- [ ] Read `frontend/e2e/README.md`
- [ ] Read `frontend/e2e/workspace-dashboard-smoke.spec.mjs`
- [ ] Verify backend: `curl -I http://127.0.0.1:8011/api/health` (or `E2E_API_BASE_URL`)
- [ ] Verify frontend: `curl -I http://127.0.0.1:5177` (or `E2E_APP_BASE_URL`)
- [ ] Ensure Playwright browsers are installed: `npx playwright install chromium webkit`

## Environment Defaults
- Frontend URL: `http://127.0.0.1:5177` (override with `E2E_APP_BASE_URL`)
- Backend URL: `http://127.0.0.1:8011` (override with `E2E_API_BASE_URL`)
- Browser: `webkit` (override with `E2E_BROWSER`)

## Tasks

### 1. Source/runtime truth
Record in `RUNTIME_PROOF_CHECKLIST.md`:
- `git branch --show-current`
- `git rev-parse HEAD`
- `git status -sb`
- Backend `curl -I` result
- Frontend `curl -I` result

### 2. Playwright readiness
```bash
cd frontend
npx playwright install chromium webkit
```
Record installation outcome.

### 3. Run smoke spec
```bash
cd frontend
export E2E_BROWSER=webkit
npx playwright test e2e/workspace-dashboard-smoke.spec.mjs --workers=1 --reporter=list
```
Capture exit code, output, and any console errors.

### 4. Console / artifact audit
- Collect Playwright report / `playwright-report/` or test output.
- Note any `TypeError`, `ReferenceError`, or unhandled rejection.
- Save relevant logs in `.planning/contours/stage1/test-e2e-smoke-20260613T074137Z/proof/`.

### 5. Fill `RUNTIME_NAVIGATION.md`
Document exact URLs, login steps (if any), and the sequence used to reach the workspace dashboard under test.

### 6. Update `STATE.json`
Set `worker_status` to `complete` or `blocked`.

## Constraints
- **NO product code changes.** This is a validation/test contour only.
- **NO merge / deploy / PR.**
- If runtime is missing and cannot be started, mark `BLOCKED` and halt.
- If a test fails, capture the failure verbatim; do not patch product code to make it pass.

## Deliverables
- `RUNTIME_NAVIGATION.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- Test output / logs in `proof/`
- Updated `STATE.json`
