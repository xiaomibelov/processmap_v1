# Agent 2 (Worker) — Contour: stage1/test-paths-mcpfix2-20260612T212347Z

## Mission
Execute the bounded MCP test-path validation plan in `PLAN.md`. You are the sole Worker; there is no other Agent 2.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` fully
- [ ] Read `frontend/e2e/README.md`
- [ ] Read `frontend/e2e/helpers/mcpMockServer.mjs` and `frontend/e2e/helpers/bpmnFixtures.mjs`
- [ ] Verify backend: `curl -I http://127.0.0.1:8011/api/health` (or `E2E_API_BASE_URL`)
- [ ] Verify frontend: `curl -I http://127.0.0.1:5177` (or `E2E_APP_BASE_URL`)
- [ ] Ensure Playwright browsers are installed: `npx playwright install chromium webkit`

## Environment Defaults
- Frontend URL: `http://127.0.0.1:5177` (override with `E2E_APP_BASE_URL`)
- Backend URL: `http://127.0.0.1:8011` (override with `E2E_API_BASE_URL`)
- MCP mock URL: `http://127.0.0.1:65534/mcp`
- Browser: `webkit` (override with `E2E_BROWSER`)

## Tasks

### 1. Source/runtime truth
Record in `RUNTIME_PROOF_CHECKLIST.md`:
- `git branch --show-current`
- `git rev-parse HEAD`
- `git status -sb`
- Backend `curl -I` result
- Frontend `curl -I` result

### 2. MCP-off graceful skip (baseline)
Run:
```bash
cd frontend
E2E_BROWSER=webkit npx playwright test e2e/mcp-wiring-smoke.spec.mjs --workers=1 --reporter=list
```
Record that the spec is skipped when `E2E_BPMN_MCP_URL` is absent. This is the expected graceful behavior.

### 3. Start MCP mock server
Run in a background shell / task:
```bash
node frontend/e2e/helpers/mcpMockServer.mjs
```
Probe it with:
```bash
curl -s -X POST http://127.0.0.1:65534/mcp \
  -H 'content-type: application/json' \
  -d '{"kind":"big_bpmn_fixture","options":{"seed":20260221,"pools":1,"lanes":1,"tasks":1,"edges":1,"annotations":0}}'
```
Record HTTP status, XML length, and hash (`fnv1aHex`) in `RUNTIME_PROOF_CHECKLIST.md`.

### 4. MCP-on test run
Run each spec and capture exit codes / logs:
```bash
cd frontend
export E2E_BROWSER=webkit
export E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp
npx playwright test e2e/mcp-wiring-smoke.spec.mjs --workers=1 --reporter=list
npx playwright test e2e/bpmn-roundtrip-big.spec.mjs --workers=1 --reporter=list
npx playwright test e2e/tab-transition-matrix-big.spec.mjs --workers=1 --reporter=list
```
For `mcp-wiring-smoke`, confirm `source=mcp` in output.

### 5. MCP-off / local fallback test run
Stop the mock server, then run:
```bash
cd frontend
export E2E_BROWSER=webkit
unset E2E_BPMN_MCP_URL
npx playwright test e2e/bpmn-roundtrip-big.spec.mjs --workers=1 --reporter=list
npx playwright test e2e/tab-transition-matrix-big.spec.mjs --workers=1 --reporter=list
```
Confirm specs still pass using local fixture generation.

### 6. Console / artifact audit
- Collect Playwright report / `playwright-report/` or test output.
- Note any `TypeError`, `ReferenceError`, or unhandled rejection.
- Save relevant logs in `.planning/contours/stage1/test-paths-mcpfix2-20260612T212347Z/proof/`.

### 7. Fill `RUNTIME_NAVIGATION.md`
Document exact URLs, login steps (if any), and the sequence used to reach the diagram/session under test.

### 8. Update `STATE.json`
Set `worker_status` to `complete` or `blocked`.

## Constraints
- **NO product code changes.** This is a validation/test contour only.
- **NO merge / deploy / PR.**
- If runtime is missing and cannot be started, mark BLOCKED and halt.
- If a test fails, capture the failure verbatim; do not patch product code to make it pass.

## Deliverables
- `RUNTIME_NAVIGATION.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- Test output / logs in `proof/`
- Updated `STATE.json`
