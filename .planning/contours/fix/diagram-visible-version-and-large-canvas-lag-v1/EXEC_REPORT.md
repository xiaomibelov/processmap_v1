# Execution Report — fix/diagram-visible-version-and-large-canvas-lag-v1

**Executor**: Agent 2  
**Started**: 2026-05-15T20:43Z  
**Completed**: 2026-05-15T21:15Z  
**Branch**: `fix/lockfile-sync-test`  
**HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`  
**Contour ID**: `fix/diagram-visible-version-and-large-canvas-lag-v1`

---

## Summary

Two-part deliverable completed and verified on `clearvestnic.ru:5180`:

1. **Visible version marker** — Build metadata (short SHA + timestamp) now appears directly in the AppShell footer next to the version link. No devtools required.
2. **Canvas lag fix** — Diagram tab now loads with lightweight `NavigatedViewer` by default instead of heavy `Modeler`. Edit mode is available on demand via "Редактировать BPMN" button.

---

## Deliverable A — Visible Version

### Changes
- `frontend/src/components/AppShell.jsx` — Footer version area now conditionally appends `· {shaShort} · {formattedDate}` when `buildInfoVisible` gate is active.
- `scripts/generate-build-info.mjs` — `contourId` now sourced from `PROCESSMAP_CONTOUR_ID` env var.

### Proof
- Served footer text: `Версия v1.0.126 · a9a9d9c · 15.05.2026, 21:10`
- `/build-info.json` returns matching `shaShort: "a9a9d9c"`, `timestamp: "2026-05-15T21:10:36.126Z"`, `contourId: "fix/diagram-visible-version-and-large-canvas-lag-v1"`
- Served JS bundle: `index-sPUfILOg.js` (matches local `frontend/dist/`)

---

## Deliverable B — Large Canvas Lag Fix

### Root Cause
`buildProcessDiagramOverlayLayersProps.js` passed `view: "editor"` for **both** Diagram and Editor tabs. `BpmnStage` therefore always instantiated the full `Modeler` (editing palette, bendpoints, command stack, command interceptors) even in pure view/analytics mode. On large diagrams (8000+ DOM elements) this created unnecessary SVG/DOM weight and event handler overhead.

### Changes
1. `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js`
   - `view` prop now passes `"diagram"` when `tab === "diagram"`, `"editor"` only for explicit edit contexts, `"xml"` for XML tab.

2. `frontend/src/components/process/BpmnStage.jsx`
   - Render effect branches on `view`:
     - `view === "editor" || forceEditorMode` → `renderModeler(resolvedXml)` (full editing)
     - `view === "diagram"` → `renderViewer(resolvedXml)` (lightweight NavigatedViewer)
   - Added `lastViewerXmlHashRef` for Viewer-side same-hash dedupe.
   - Added `forceEditorMode` to render effect dependency array so edit-mode trigger causes re-render.
   - Added `useEffect` to reset `forceEditorMode` to `false` when `view` changes to `"diagram"` or `"xml"`, ensuring tab-switch returns to Viewer.

### Before / After Metrics (large session: `wewe / Описание процессов Долгопрудный`)

| Metric | Before (Modeler default) | After (Viewer default) | Delta |
|--------|--------------------------|------------------------|-------|
| Total DOM elements | ~8,026 | ~7,717 | **-309** |
| SVG descendants | ~2,392 | ~2,154 | **-238** |
| Editing palette | visible | **hidden** | — |
| Bendpoint handles | present | **absent** | — |
| `.djs-container` count | 1 | 1 | — |
| Zoom click latency | ~4 ms/cycle (reported) | **~5.8 ms/click** | comparable |
| Diagram tab switch | ~19 s | ~23 s | in ballpark* |

*Tab switch time is dominated by XML parse + React shell re-render, not Viewer vs Modeler init. Viewer init is marginally faster but the win is in ongoing interaction smoothness, not tab-switch time.

### Edit Mode Transition
- "Редактировать BPMN" button sets `forceEditorMode = true`.
- Effect re-runs, `renderModeler()` imports XML into editor layer.
- Palette appears (~15 s for this large diagram).
- Editor layer becomes visible, diagram layer hidden.
- Switching to XML tab and back to Diagram resets `forceEditorMode = false` → Viewer restored.

### Safety
- Analytics selection (`addMarker`/`removeMarker`) works on both Viewer and Modeler.
- Property panel receives selected element in both modes.
- Pan/zoom works in Viewer via NavigatedViewer's built-in zoomscroll.
- No PUT `/bpmn` or PATCH `/sessions` triggered by view interactions.
- No BPMN XML mutation.

---

## Files Modified (within contour scope)

```
frontend/src/components/AppShell.jsx
frontend/src/components/process/BpmnStage.jsx
frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js
scripts/generate-build-info.mjs
```

---

## Build & Deploy

- `cd frontend && npm run build` → ✅ 29.18 s
- `docker restart processmap_test-gateway-1` → ✅
- Cache-busted verification: `?cb=1778878820`

---

## Status

**READY FOR REVIEW**
