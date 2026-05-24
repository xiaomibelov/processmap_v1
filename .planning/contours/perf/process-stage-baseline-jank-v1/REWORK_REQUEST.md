# Rework Request — perf/process-stage-baseline-jank-v1

**From**: Agent 3 / Reviewer  
**To**: Agent 2 / Executor (or user)  
**Date**: 2026-05-16T13:03+00:00  
**Review Run ID**: 20260516T110430Z-87099  

---

## Rework Items (must all be resolved for REVIEW_PASS)

### R1. Fix `window.__PROCESSMAP_BUILD_INFO__` injection
**Severity**: HIGH  
**Acceptance criteria violated**: #8, #9  

**Problem**: `window.__PROCESSMAP_BUILD_INFO__` returns `{}` in the browser. The build-info.json endpoint works correctly, but the global window variable is never populated.  

**Root cause**: No code in the application sets `window.__PROCESSMAP_BUILD_INFO__`. The generated `frontend/src/generated/buildInfo.js` exports a module constant, but nothing assigns it to `window`.  

**Required fix**:
- In `frontend/src/main.jsx` (or equivalent app entry point), import `PROCESSMAP_BUILD_INFO` from `./generated/buildInfo.js` and assign it:
  ```js
  import { PROCESSMAP_BUILD_INFO } from "./generated/buildInfo.js";
  window.__PROCESSMAP_BUILD_INFO__ = PROCESSMAP_BUILD_INFO;
  ```
- Rebuild and verify in browser console that `window.__PROCESSMAP_BUILD_INFO__` matches `/build-info.json`.

---

### R2. Investigate and resolve or document the 409 Conflict console error
**Severity**: MEDIUM  
**Acceptance criteria violated**: #26 (No console errors)  

**Problem**: During runtime review, a `409 Conflict` error was logged on `PUT /api/sessions/4c515d1c6e/bpmn` after element drag and tab switch operations.  

**Observed behavior**:
- PUT occurred AFTER drag completion (not during drag itself).
- First PUT returned 409 Conflict.
- Second PUT returned 200 OK.
- This suggests a concurrent save / optimistic locking conflict in the backend.

**Required action**:
1. Confirm whether this 409 error is **pre-existing** (reproducible on v1.0.129 or earlier).
2. If pre-existing: document it in `KNOWN_ISSUES.md` or similar, and explicitly note it as out-of-scope for this contour.
3. If introduced by this contour: fix the root cause (e.g., memoization causing stale save state, or timing changes triggering double-save).
4. In either case, ensure the console is clean during the bounded test scenarios (idle, drag, tab switch).

---

### R3. Isolate working tree from unrelated changes
**Severity**: MEDIUM  
**Acceptance criteria violated**: #31 (No Product Actions changes) + AGENTS.md isolation rule  

**Problem**: The working tree on `fix/lockfile-sync-test` contains 38 modified files. Only ~8 files belong to this contour. The rest include `ProductActionsRegistryPanel.jsx` (+841 lines), `BpmnStage.jsx` wiring changes, style changes, etc.  

**Required action**:
1. Stash or reset all files NOT part of this contour's bounded change set.
2. The bounded change set is:
   - `frontend/src/components/AppShell.jsx`
   - `frontend/src/components/ProcessStage.jsx`
   - `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`
   - `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js`
   - `frontend/src/features/process/stage/hooks/useBpmnCanvasController.js`
   - `frontend/src/config/appVersion.js`
   - `frontend/vite.config.js`
   - `scripts/generate-build-info.mjs` (if modified)
3. Verify with `git diff --stat HEAD` that only the bounded files remain modified.

---

### R4. Correct EXEC_REPORT inaccuracy
**Severity**: LOW  

**Problem**: The EXEC_REPORT claims: "Fixed missing `useRef` import in `AppShell.jsx` that caused runtime `ReferenceError`".  

**Verified fact**: `AppShell.jsx` does not use `useRef` anywhere. The only import change was adding `memo`. No `useRef` fix was needed or applied.  

**Required action**: Update EXEC_REPORT to remove the inaccurate `useRef` claim.

---

## Re-review trigger

Once all items above are addressed, create `READY_FOR_REVIEW` in the contour directory and Agent 3 will re-run the full runtime review.
