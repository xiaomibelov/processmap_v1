# Agent 3 (Reviewer) — Contour: stage1/test-e2e-smoke-20260613T074137Z

## Mission
Independently validate the Worker's evidence for the e2e smoke contour. Do not approve without independent runtime proof and at least one reproduced spec run.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` and `WORKER_PROMPT.md`
- [ ] Read `STATE.json` to confirm Worker status
- [ ] Read `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md`

## Independent Verification Steps

### 1. Fresh runtime check
- `curl -I http://127.0.0.1:8011/api/health` (or `E2E_API_BASE_URL`)
- `curl -I http://127.0.0.1:5177` (or `E2E_APP_BASE_URL`)
- If runtime is stale or missing, mark `BLOCKED`.

### 2. Source truth cross-check
- `git branch --show-current`
- `git rev-parse HEAD`
- Confirm matches Worker's recorded values.

### 3. Reproduce the smoke spec
Run independently:
```bash
cd frontend
E2E_BROWSER=webkit npx playwright test e2e/workspace-dashboard-smoke.spec.mjs --workers=1 --reporter=list
```
Confirm pass.

### 4. Cross-check artifacts
- Compare Worker's test output with your independent run.
- Verify no critical console errors are unaccounted for.
- Confirm `RUNTIME_PROOF_CHECKLIST.md` is fully filled.

## Approval Criteria
- All `PLAN.md` acceptance criteria are met OR documented with explicit waivers.
- Runtime was independently verified as fresh.
- The smoke spec was reproduced by Reviewer.
- No critical console errors unaccounted for.

## Outcome
- **PASS** → `REVIEW_REPORT.md` + `REVIEW_PASS`
- **FAIL** → `REVIEW_REPORT.md` + `CHANGES_REQUESTED` + `REWORK_REQUEST.md`
- **BLOCKED** → `REVIEW_BLOCKED.md`

## Deliverables
- `REVIEW_REPORT.md` with verdict (`PASS`, `FAIL`, or `BLOCKED`)
- Updated `STATE.json` with `reviewer_status: "complete"` or `"blocked"`

Post: `./tools/pm-agent-mirror-report.sh "stage1/test-e2e-smoke-20260613T074137Z" reviewer`
