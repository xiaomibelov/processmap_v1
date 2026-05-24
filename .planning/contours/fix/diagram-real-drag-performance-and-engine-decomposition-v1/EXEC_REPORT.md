# Execution Report — fix/diagram-real-drag-performance-and-engine-decomposition-v1

**Executor**: Agent 2
**Run ID**: `20260515T223804Z-56109`
**Branch**: `fix/lockfile-sync-test`
**HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
**Contour ID**: `fix/diagram-real-drag-performance-and-engine-decomposition-v1`
**Started**: 2026-05-15T22:43Z
**Completed**: 2026-05-15T22:56Z

---

## Summary

1. **Version Marker Relocation**: Removed canvas overlay badge from `BpmnStage.jsx`; extended `AppShell.jsx` footer with contourId.
2. **Real Drag Baseline**: Playwright real mouse drag on large no-overlays diagram. Identified 34 long tasks (~6,244ms) before fix.
3. **Source Forensic**: Mapped drag stack in `wireBpmnStageRuntimeEvents.js`. Found `viewbox.changed` and `selection.changed` handlers performing heavy work during drag.
4. **Bounded Drag Fix**: Added `dragInProgress` guard to suppress React-side overhead during drag. Long tasks reduced to ~20 (~2,848ms), a ~54% improvement.
5. **Engine Evaluation**: Evaluated 6 alternative engines. Decision: continue optimizing bpmn-js; recommend research/prototype contour if remaining lag is unacceptable.

---

## Source / Runtime Truth

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| date | `2026-05-15T22:52:40+00:00` |
| branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| dirty files | 34 frontend files + `.env` + `docker-compose.yml` (pre-existing) |
| 5180 health | HTTP 200 OK |
| docker gateway | `processmap_test-gateway-1` up, port 5180→80 |
| 5180 build-info SHA | `a9a9d9c` matches HEAD |
| 5180 build-info contourId | `fix/diagram-real-drag-performance-and-engine-decomposition-v1` |
| served JS asset | `assets/index-DtKts5bb.js` (fresh hash) |

---

## Part A — Version Marker Relocation

### Changes
- `BpmnStage.jsx`: removed `<DiagramRuntimeVersionBadge>` overlay and import
- `AppShell.jsx`: appended `PROCESSMAP_BUILD_INFO.contourId` to footer `footerHint`
- `scripts/generate-build-info.mjs`: updated fallback contourId

### Verification
- Footer shows: `Версия v1.0.126 · a9a9d9c · 15.05.2026, 22:52 · fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- `window.__PROCESSMAP_BUILD_INFO__` verified with correct contourId
- No canvas badge found
- Screenshots captured

---

## Part B — Real Drag Baseline (before fix)

- DOM: 7,710 total, 2,107 SVG
- Overlays: 0
- Canvas pan: 34 long tasks, ~6,244ms total
- Element drag (view mode): prevented as expected
- Network: 0 PUT, 0 PATCH

---

## Part C — Source Forensic

### Key Findings
- `wireBpmnStageRuntimeEvents.js` lines 360–429 (viewer) and 524–587 (modeler):
  - `selection.changed` handler calls `syncAiQuestionPanelWithSelection`, `setSelectedDecor`, `emitElementSelection`
  - `canvas.viewbox.changed` handler calls `getCanvasSnapshot`, `logViewAction`, `emitViewboxChanged`, `applyPropertiesOverlayDecorForZoomChange`
- `dragInProgress` ref exists (set by `drag.start`/`drag.cleanup`) but was unused for guarding these handlers
- `useBpmnSettledDecorFanout.js`: selection fanout gated by `selectedMarkerStateRef`; does not run during empty-canvas pan
- `useProcessTabs.js`: no direct drag interaction; `selectedElementContext` is memoized

---

## Part D — Bounded Drag Performance Fix

### Applied Options
- **Option B** (suppress React updates during drag): `isDragInProgress()` guard in `onViewboxChanged` and `onSelectionChanged`
- **Option C** (disable selection/focus updates during drag): same guard skips `syncAiQuestionPanelWithSelection` and decor updates
- **Option D** (pause decor fanout): implicitly covered; no decor fanout triggered during empty-canvas pan, and selection sync is suppressed

### Not Applied
- **Option E** (fix view vs edit mode): view mode already prevents element drag via NavigatedViewer; no change needed

### Files Modified
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

---

## Part E — Engine Evaluation

See `ENGINE_EVALUATION.md`.

Decision: continue bpmn-js optimization. If remaining lag is unacceptable, recommend `research/diagram-engine-evaluation-large-bpmn-v1` or `prototype/diagram-gojs-or-yfiles-large-flow-spike-v1`.

---

## Part F — After Fix Validation

- Long tasks: 20 (was 34) — **-41%**
- Long task total: ~2,848ms (was ~6,244ms) — **-54%**
- DOM/SVG: stable
- Console: 0 new errors
- Network: 0 PUT/PATCH from drag
- Build: 0 errors

---

## Files Changed for This Contour

1. `frontend/src/components/process/BpmnStage.jsx`
2. `frontend/src/components/AppShell.jsx`
3. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
4. `scripts/generate-build-info.mjs`

## Reports Created

1. `EXEC_REPORT.md`
2. `VERSION_MARKER_RELOCATION_PROOF.md`
3. `REAL_DRAG_BASELINE.md`
4. `DRAG_LAG_ROOT_CAUSE.md`
5. `RUNTIME_BEFORE_AFTER.md`
6. `ENGINE_EVALUATION.md`
7. `IMPLEMENTATION_NOTES.md`
8. `READY_FOR_REVIEW`
9. `EXECUTION_RUN_ID`

---

## Status

**READY FOR REVIEW**
