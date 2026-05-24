# EXECUTOR_PROMPT — perf/session-analysis-bpmn-tab-switch-load-regression-v1

## Your Role
Agent 2 / Executor. You implement the bounded fix. You DO NOT plan, redesign, or scope creep.

## Read First

1. `PLAN.md` — full plan, source map, root causes, fix direction
2. `RUNTIME_NAVIGATION.md` — exact reproduction route
3. `RUNTIME_PROOF_CHECKLIST.md` — mandatory checks
4. `STATE.json` — scope boundaries

## Reproduce Before Fix

1. Open session `4c515d1c6e` at `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
2. Open browser DevTools → Network
3. Perform tab cycle: Analysis → BPMN → Analysis → BPMN → Analysis
4. Record:
   - Count of `GET /bpmn/versions?limit=1` calls
   - Count of `PATCH /api/sessions/{id}` calls
   - Any 409 Conflicts
   - Any duplicate toasts
   - Perceived switch time

## Bounded Fix Implementation

### Fix 1: Stop `/bpmn/versions?limit=1` spam

**File:** `frontend/src/components/ProcessStage.jsx`  
**Problem:** Effect at ~line 5250 fires on every `draft?.bpmn_xml_version/updated_at/version` change.  
**Safe changes:**
- Replace unstable deps (`draft?.updated_at`, `draft?.version`) with a stable fingerprint.
- Or wrap the effect body with a stable in-flight flag so only one request runs at a time.
- Ensure `refreshSnapshotVersions` dedupes `updateList: false` calls (used by `refreshLatestBpmnRevisionHead`).

### Fix 2: Eliminate PATCH on tab switch

**File:** `frontend/src/features/process/hooks/useProcessTabs.js`  
**Problem:** Lines ~826-848 call `enqueueSessionPatchCasWrite({ patch: { interview: projected.nextInterview } })` on every Diagram → Interview switch.  
**Safe changes:**
- Compare `projected.nextInterview` with existing `draft?.interview` before PATCH.
- If no material change, skip PATCH entirely.
- If PATCH is needed for correctness, ensure `base_diagram_state_version` is fresh to avoid 409.
- Consider marking the sync as "optimistic only" and deferring PATCH to explicit save.

### Fix 3: Cache `parseAndProjectBpmnToInterview`

**File:** `frontend/src/features/process/hooks/useProcessTabs.js`  
**Problem:** `parseAndProjectBpmnToInterview` runs on every Diagram → Interview switch.  
**Safe changes:**
- Memoize projection result by `bpmn_xml` hash + `bpmn_xml_version`.
- Skip re-projection if inputs unchanged.

### Fix 4: Preserve Interview state / reduce remount cost

**File:** `frontend/src/components/ProcessStage.jsx`  
**Problem:** `InterviewStage` unmounts when leaving Analysis tab, causing heavy re-init.  
**Safe changes:**
- Render `InterviewStage` with `style={{ display: 'none' }}` when tab is not `interview`, OR
- Lift heavy derived interview state out of `InterviewStage` so it survives unmount.
- Prefer the minimal CSS-hiding approach if it does not break layout.

### Fix 5: Deduplicate 409/error toasts

**File:** `frontend/src/components/ProcessStage.jsx`  
**Problem:** `genErr`/`infoMsg` effect can show duplicate toasts for recurring 409s.  
**Safe changes:**
- Expand `processStatusToastLastSignatureRef` dedupe to include error code/category.
- Rate-limit 409 toast re-shows (e.g., max once per 30s per signature).

## What You Must NOT Change

- Backend schema or endpoints
- BPMN XML storage/mutation logic
- Product Actions AI / RAG / AG-UI
- `WorkspaceExplorer`, `AuthProvider`, routing
- `.env`, secrets, durable truth outside session state

## Validation Steps

1. Run frontend tests: `cd frontend && npm test` (or equivalent)
2. Run frontend build: `cd frontend && npm run build`
3. Reproduce tab switch cycle on runtime
4. Compare network counts:
   - `GET /bpmn/versions?limit=1` should be ≤ 1 per switch
   - `PATCH /api/sessions/{id}` should be 0 per switch
   - No 409 Conflict from tab switch
   - No duplicate toasts
5. Write `EXEC_REPORT.md` with before/after numbers
6. Create `READY_FOR_REVIEW` file

## EXEC_REPORT Template

Create `EXEC_REPORT.md` in the contour directory:

```markdown
# EXEC_REPORT — perf/session-analysis-bpmn-tab-switch-load-regression-v1

## Verdict
READY_FOR_REVIEW / EXEC_BLOCKED

## Source Truth
- repo: /opt/processmap-test
- branch: <branch>
- HEAD: <hash>
- origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
- git status: <summary>

## Baseline Reproduction
- session URL: http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e
- tab cycle steps: Analysis → BPMN → Analysis → BPMN → Analysis
- request counts (before): <numbers>
- slow timings (before): <ms>
- duplicate notifications (before): <yes/no + description>

## Root Cause
<concrete source-level explanation>

## Fix Summary
- files changed: <list>
- why fix is bounded: <explanation>
- why no durable mutation: <explanation>

## Validation
- commands run: <list>
- build/tests: <pass/fail>
- runtime tab cycle after fix: <description>
- request counts after fix: <numbers>
- screenshot/evidence paths: <paths>

## Safety
- no backend schema changes: <confirm>
- no BPMN XML mutation: <confirm>
- no PUT/PATCH on tab switch: <confirm>
- no Product Actions/RAG/AG-UI changes: <confirm>
```
