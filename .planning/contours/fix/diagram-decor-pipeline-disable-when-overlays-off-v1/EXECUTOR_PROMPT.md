# Agent 2 Executor Prompt

## Contour
- **ID**: `fix/diagram-decor-pipeline-disable-when-overlays-off-v1`
- **Role**: Agent 2 / Executor
- **Scope**: Frontend-only bounded guard to skip property overlay decor pipeline when overlays are off.

## Pre-flight
1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. Read previous audit reports:
   - `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/BASELINE_PROFILE_REPORT.md`
   - `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/SOURCE_MAP.md`
3. Baseline before code:
   - Confirm overlays-off path in `useBpmnSettledDecorFanout.js` (Properties effect lines 153–168).
   - Confirm `runSettledPropertiesFanout` is called unconditionally today.
   - Verify `applyPropertiesOverlayDecor` early-exit behavior in `decorManager.js` lines 1594–1635.

## Implementation

### Single file change (plus test)
**File**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`

Add a ref-based early guard in the Properties effect:

1. At the top of the hook (after `cbRef`), add:
   ```js
   const propertiesOverlayDidClearRef = useRef(false);
   ```

2. In the Properties `useEffect` (lines 153–168), replace the unconditional `runSettledPropertiesFanout` call with:
   ```js
   const overlaysOff = !propertiesOverlayAlwaysEnabled && !selectedPropertiesOverlayPreview;
   if (overlaysOff && propertiesOverlayDidClearRef.current) {
     // Already cleared; skip redundant fanout
     return;
   }
   runSettledPropertiesFanout({
     viewerInst: viewerRef.current,
     modelerInst: modelerRef.current,
     view,
     applyPropertiesOverlayDecor: cbRef.current.applyPropertiesOverlayDecor,
     clearPropertiesOverlayDecor: cbRef.current.clearPropertiesOverlayDecor,
   });
   propertiesOverlayDidClearRef.current = overlaysOff;
   ```

3. Ensure the effect dependency array remains unchanged:
   ```js
   [
     propertiesOverlayAlwaysEnabled,
     propertiesOverlayAlwaysPreviewByElementId,
     selectedPropertiesOverlayPreview,
     readySignal,
     view,
   ]
   ```

**Test file**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs`

Add a new test case (after the existing test) covering:
- When `propertiesOverlayAlwaysEnabled: false` and `selectedPropertiesOverlayPreview: null`:
  - First render runs `applyPropertiesOverlayDecor` / `clearPropertiesOverlayDecor` once.
  - Changing `view` (e.g., "viewer" → "editor") while overlays remain off does NOT call the callbacks again.
- When toggling `propertiesOverlayAlwaysEnabled` from false → true:
  - Callbacks are called again (guard resets).

Use spies/counters on `applyPropertiesOverlayDecor` and `clearPropertiesOverlayDecor` props to verify.

### Forbidden changes
- Do NOT modify `postStagingFanout.js`.
- Do NOT modify `decorManager.js`.
- Do NOT modify `BpmnStage.jsx`.
- Do NOT modify backend files.
- Do NOT modify `.env` or secrets.
- Do NOT commit/push/PR.

## Validation Checklist

- [ ] `node --test frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs` passes (including new test).
- [ ] `node --test frontend/src/features/process/bpmn/stage/fanout/postStagingFanout.test.mjs` passes unchanged.
- [ ] `node --test frontend/src/features/process/bpmn/stage/decor/decorManager.test.mjs` passes unchanged.
- [ ] Build passes (`npm run build` or equivalent in `frontend/`).
- [ ] Runtime overlays off: open Diagram, confirm `.fpcPropertyOverlay` = 0.
- [ ] Runtime overlays off: switch Analysis ↔ Diagram tabs, confirm no duplicate/redundant overlay behavior.
- [ ] Runtime overlays on: toggle "Свойства" (properties overlay always on), confirm overlays render.
- [ ] Runtime overlays on: pan/zoom, confirm overlays update and no duplicates.
- [ ] Network: confirm 0 PUT `/bpmn`, 0 PATCH `/sessions`, no versions spam regression.
- [ ] Selection: confirm no regression (selection DOM inflation may remain; that is expected).

## Deliverables

Create the following files in the contour directory:

1. `EXEC_REPORT.md` — what was done, what passed, what failed.
2. `IMPLEMENTATION_NOTES.md` — exact lines changed, reasoning, test additions.
3. `RUNTIME_BEFORE_AFTER.md` — runtime metrics before and after the fix.
4. `READY_FOR_REVIEW` — empty marker file.

If blocked:
- Create `EXEC_BLOCKED.md` with reason and evidence.
- Do NOT create `READY_FOR_REVIEW`.
