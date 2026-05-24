# Agent 3 Reviewer Prompt

## Contour
- **ID**: `fix/diagram-decor-pipeline-disable-when-overlays-off-v1`
- **Role**: Agent 3 / Reviewer
- **Scope**: Verify the bounded guard in `useBpmnSettledDecorFanout.js` works correctly.

## Pre-flight
1. Read `PLAN.md`, `EXEC_REPORT.md`, `IMPLEMENTATION_NOTES.md`, `RUNTIME_BEFORE_AFTER.md`, `RUNTIME_PROOF_CHECKLIST.md`.
2. Verify only expected files were modified:
   ```bash
   git diff --name-only
   ```
   Expected: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` and its test file.

## Review Steps

### 1. Source Review
- Open `useBpmnSettledDecorFanout.js`.
- Confirm:
  - A `propertiesOverlayDidClearRef` exists.
  - The Properties effect checks `!propertiesOverlayAlwaysEnabled && !selectedPropertiesOverlayPreview`.
  - When overlays are off and already cleared, the effect returns early before calling `runSettledPropertiesFanout`.
  - When overlays are on, the ref resets and the normal path runs.
  - Other fanout effects (Notes, StepTime, RobotMeta, Selection) are untouched.

### 2. Test Review
- Open `useBpmnSettledDecorFanout.test.mjs`.
- Confirm new test(s) exist covering:
  - Skip behavior when overlays are off after first clear.
  - Reset behavior when overlays toggle on.

### 3. Playwright Runtime Review

Use the runtime URL: `http://clearvestnic.ru:5180`

**Scenario A — Overlays OFF baseline**
1. Open Diagram tab with overlays off (`include_overlay=0` or toggle off).
2. In browser console:
   ```js
   document.querySelectorAll('.fpcPropertyOverlay').length
   ```
   Expected: `0`.
3. Count total DOM and SVG:
   ```js
   document.querySelectorAll('*').length
   document.querySelectorAll('svg *').length
   ```
   Record values.

**Scenario B — Overlays OFF tab switch**
1. Click Analysis tab, then return to Diagram.
2. Re-check:
   ```js
   document.querySelectorAll('.fpcPropertyOverlay').length
   ```
   Expected: `0`.
   No duplicate overlays.
   Total DOM should be stable (no overlay-related inflation).

**Scenario C — Overlays ON**
1. Enable property overlays (toggle "Свойства" or use session with `include_overlay=1`).
2. Verify `.fpcPropertyOverlay` > 0.
3. Verify viewport culling: pan to empty area, overlays outside viewport should not be in DOM (or should be minimal).
4. Pan/zoom; confirm overlays update position and no duplicates appear.

**Scenario D — Network mutations**
- Open DevTools Network tab.
- Filter: `method:PUT`, `method:PATCH`, `/bpmn/versions`.
- During all scenarios above, confirm:
  - 0 PUT `/bpmn`
  - 0 PATCH `/sessions`
  - `/bpmn/versions?limit=1` calls are ≤ 3 during load (no regression).

**Scenario E — Selection regression**
- Select a BPMN element.
- Confirm selection still works (no console errors).
- Confirm selection DOM inflation is unchanged (this contour does NOT fix selection; documented as next contour).

### 4. Acceptance Criteria Verification

| Criterion | Pass Criteria | Status |
|-----------|---------------|--------|
| Overlays off: `.fpcPropertyOverlay` = 0 | Must be 0 | |
| Overlays off: property overlay path skipped earlier | Source shows guard prevents fanout call | |
| Overlays on: property overlays render | `.fpcPropertyOverlay` > 0 | |
| Overlays on: viewport culling works | Pan to edge, no excess overlays | |
| Pan/zoom stable | No duplicates, overlays update | |
| Tab switch stable | No duplicates, no crashes | |
| No PUT/PATCH | 0 mutations | |
| No versions spam | ≤ 3 `versions?limit=1` on load | |
| Scope bounded | Only useBpmnSettledDecorFanout.js + test changed | |
| Selection bottleneck left for next contour | No `fpcFocusDim` or selection handle changes | |

## Verdict

- If ALL criteria pass → create `REVIEW_REPORT.md` with evidence and `REVIEW_PASS` marker.
- If ANY criterion fails → create `CHANGES_REQUESTED` + `REWORK_REQUEST.md` with specific issue and reproduction steps. Do NOT create `REVIEW_PASS`.
