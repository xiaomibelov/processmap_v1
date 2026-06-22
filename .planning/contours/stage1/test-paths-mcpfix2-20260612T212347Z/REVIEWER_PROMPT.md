# Agent 3 (Reviewer) — Contour: stage1/test-paths-mcpfix2-20260612T212347Z

## Mission
Independently validate the Worker’s evidence for the MCP test-path contour. Do not approve without independent runtime proof and at least one reproduced spec run.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` and `WORKER_PROMPT.md`
- [ ] Read `STATE.json` to confirm Worker status
- [ ] Read `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md`

## Independent Verification Steps

### 1. Fresh runtime check
- `curl -I http://127.0.0.1:8011/api/health` (or `E2E_API_BASE_URL`)
- `curl -I http://127.0.0.1:5177` (or `E2E_APP_BASE_URL`)
- If runtime is stale or missing, mark BLOCKED.

### 2. Source truth cross-check
- `git branch --show-current`
- `git rev-parse HEAD`
- Confirm matches Worker’s recorded values.

### 3. MCP mock server independent probe
Start a fresh mock server (if not already running) and probe:
```bash
node frontend/e2e/helpers/mcpMockServer.mjs &
curl -s -X POST http://127.0.0.1:65534/mcp \
  -H 'content-type: application/json' \
  -d '{"kind":"big_bpmn_fixture","options":{"seed":20260221,"pools":1,"lanes":1,"tasks":1,"edges":1,"annotations":0}}'
```
Confirm HTTP 200, valid XML, `hasDI=true`.

### 4. Reproduce at least one MCP-on spec
Run one of the following independently:
```bash
cd frontend
E2E_BROWSER=webkit E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp \
  npx playwright test e2e/mcp-wiring-smoke.spec.mjs --workers=1 --reporter=list
```
Confirm pass and `source=mcp` in output.

### 5. Reproduce at least one MCP-off spec
Run:
```bash
cd frontend
E2E_BROWSER=webkit npx playwright test e2e/bpmn-roundtrip-big.spec.mjs --workers=1 --reporter=list
```
Confirm pass without MCP URL set.

### 6. Cross-check artifacts
- Compare Worker’s test output hashes / XML lengths with your independent probe.
- Verify no critical console errors are unaccounted for.
- Confirm `RUNTIME_PROOF_CHECKLIST.md` is fully filled.

## Approval Criteria
- All `PLAN.md` acceptance criteria are met OR documented with explicit waivers.
- Runtime was independently verified as fresh.
- At least one MCP-on and one MCP-off spec were reproduced by Reviewer.
- No critical console errors unaccounted for.

## Outcome
- **PASS** → `REVIEW_REPORT.md` + `REVIEW_PASS`
- **FAIL** → `REVIEW_REPORT.md` + `CHANGES_REQUESTED` + `REWORK_REQUEST.md`
- **BLOCKED** → `REVIEW_BLOCKED.md`

## Deliverables
- `REVIEW_REPORT.md` with verdict (`PASS`, `FAIL`, or `BLOCKED`)
- Updated `STATE.json` with `reviewer_status: "complete"` or `"blocked"`

Post: `./tools/pm-agent-mirror-report.sh "stage1/test-paths-mcpfix2-20260612T212347Z" reviewer`
