# Agent 3 (Reviewer) — Contour: stage8/test-devserver-1781309007

## Mission
Independently validate the Worker’s evidence for the dev-server smoke-test contour. Do not approve without an independent runtime probe and a cross-check of the source truth.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` and `WORKER_PROMPT.md`
- [ ] Read `STATE.json` to confirm Worker status
- [ ] Read `RUNTIME_PROOF_CHECKLIST.md` and `RUNTIME_NAVIGATION.md`

## Independent Verification Steps

### 1. Fresh runtime check
Run independently:
```bash
curl -I --max-time 5 http://localhost:5177/ 2>&1
```
Record the status line, `Date`, `Server`, `Content-Type`, and cache headers. If the server is unreachable, mark `BLOCKED` only if the Worker claimed it was reachable.

### 2. Source truth cross-check
- `git branch --show-current`
- `git rev-parse HEAD`
- Confirm matches Worker’s recorded values.

### 3. Header verification
Confirm the independent probe shows:
- HTTP 200 (if reachable)
- `Content-Type: text/html` or equivalent
- Anti-cache headers (`Cache-Control: no-cache, no-store, must-revalidate` or similar)
- A `Date` header within a reasonable window of current UTC

### 4. GET body verification
Run independently:
```bash
curl -sf --max-time 5 http://localhost:5177/ 2>&1 | head -c 300
```
Confirm an HTML body is returned.

### 5. Cross-check artifacts
- Compare Worker’s recorded headers with your independent probe.
- Verify `RUNTIME_PROOF_CHECKLIST.md` is fully filled with verbatim evidence.
- Verify `RUNTIME_NAVIGATION.md` documents the exact URL and method.

## Approval Criteria
- All `PLAN.md` acceptance criteria are met OR documented with explicit waivers.
- Runtime was independently verified as fresh (or environment-dependent unreachability is consistently documented).
- Source truth matches between Worker and Reviewer.
- No critical discrepancies in headers or body evidence.

## Outcome
- **PASS** → `REVIEW_REPORT.md` + `REVIEW_PASS`
- **FAIL** → `REVIEW_REPORT.md` + `CHANGES_REQUESTED` + `REWORK_REQUEST.md`
- **BLOCKED** → `REVIEW_BLOCKED.md`

## Deliverables
- `REVIEW_REPORT.md` with verdict (`PASS`, `FAIL`, or `BLOCKED`)
- Updated `STATE.json` with `reviewer_status: "complete"` or `"blocked"`

Post: `./tools/pm-agent-mirror-report.sh "stage8/test-devserver-1781309007" reviewer`
