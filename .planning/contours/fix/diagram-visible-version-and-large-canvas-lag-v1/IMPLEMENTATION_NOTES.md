# Implementation Notes

## AppShell.jsx
- Integrated `PROCESSMAP_BUILD_INFO` (generated at build time) into footer version area.
- Condition: `buildInfoVisible` gate (reuses existing host/branch check).
- Format: `Версия {version} · {shaShort} · {localeDateString}`.
- Preserved existing `latestChangeSummary` suffix.

## generate-build-info.mjs
- Added `contourId` from `process.env.PROCESSMAP_CONTOUR_ID`.
- Falls back to empty string if env var not set.
- Writes to both `frontend/src/generated/buildInfo.js` and `frontend/public/build-info.json`.

## buildProcessDiagramOverlayLayersProps.js
- Changed `view` prop logic from binary (`xml` vs `editor`) to ternary (`xml` vs `diagram` vs `editor`).
- This is the **single prop change** that enables the entire Viewer-first path.

## BpmnStage.jsx

### Render effect branching (lines ~5344-5427)
```
if (view === "editor" || view === "diagram") {
  resolve XML...
  if (view === "editor" || forceEditorMode) {
    // Modeler path (same as before)
  } else {
    // Viewer path (NEW)
  }
}
```

### Same-hash dedupe for Viewer
- Added `lastViewerXmlHashRef` (mirrors existing `lastModelerXmlHashRef`).
- Prevents unnecessary `importXML` when Viewer already has the same XML.

### forceEditorMode state management
- `forceEditorMode` added to render effect dependency array so edit-trigger causes re-render.
- `useEffect` resets `forceEditorMode` to `false` when `view` changes to `"diagram"` or `"xml"`.
- This ensures tab-switch always returns to Viewer, not staying in Modeler.

### Layer visibility JSX (lines ~5781-5807)
- Diagram layer: `display: view === "diagram" && !forceEditorMode ? "block" : "none"`
- Editor layer: `display: view === "editor" || forceEditorMode ? "block" : "none"`
- "Редактировать BPMN" button only rendered in diagram layer when Viewer is active.

## Build verification
- `npm run build` passed (29-33 s across iterations).
- No new test failures introduced within contour scope.
- Served assets matched local dist after each restart.
