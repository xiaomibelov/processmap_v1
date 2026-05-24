# Stuck Loading Root Cause — fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

## Executive Summary

The Diagram tab was stuck at **"Загрузка диаграммы…"** indefinitely because the **Viewer-first** code path (`view === "diagram"`) never signaled `diagramReady = true`.

## Forensic Findings

### `setDiagramReady` Call Sites in BpmnStage.jsx

| Line | Code | Context |
|------|------|---------|
| 1292 | `const [diagramReady, setDiagramReady] = useState(false);` | State declaration |
| 1501 | `setDiagramReady(false);` | Reset on `sessionId` / `reloadKey` change |
| 1721 | `setDiagramReady((prev) => (prev === nextReady ? prev : nextReady));` | **Only place that sets `true`** |

### `trackRuntimeStatus` — The Gatekeeper

`setDiagramReady(true)` is ONLY called inside `trackRuntimeStatus()` when `nextReady === true`.

`trackRuntimeStatus` is called from:
1. `bpmnWiring.js:243` via `onRuntimeStatus` callback — **Modeler runtime ONLY**
2. `destroyRuntime()` at line 4281 — sets `ready: false`

### Viewer Path — Missing Ready Signal

When `view === "diagram"`:
1. Render effect calls `renderViewer(resolvedXml)` (line 5429)
2. `renderViewerDiagram` in `bpmnRenderRuntimeLifecycle.js`:
   - Creates `NavigatedViewer`
   - Calls `v.importXML()`
   - Sets `viewerReadyRef.current = true` at line 61
   - **Does NOT call `trackRuntimeStatus`**
3. Back in BpmnStage render effect, `transition("import_success")` was added by this fix
4. **Before this fix**: no call to `setDiagramReady(true)` existed for Viewer path

### Modeler Path — Works Correctly

When `view === "editor"`:
1. Render effect calls `renderModeler(resolvedXml)`
2. `renderModelerDiagram` calls `runtime.load()`
3. Modeler runtime emits `onRuntimeStatus` via `bpmnWiring.js`
4. `trackRuntimeStatus` is called with `ready: true`
5. `setDiagramReady(true)` fires

### `viewerReadyRef.current = true` — Set but Ignored

`renderViewerDiagram` DOES set `viewerReadyRef.current = true` at line 61, but BpmnStage's render effect only checks `viewerReadyRef.current` for **same-hash dedupe** (line 5415). It does NOT use it to trigger `setDiagramReady(true)`.

## Root Cause

**H1 confirmed**: `setDiagramReady(true)` was only triggered by Modeler-ready callback (`trackRuntimeStatus` via `bpmnWiring.js`). The Viewer import success path had no wiring to `setDiagramReady`. Previous contour changed `buildProcessDiagramOverlayLayersProps.js` to pass `view: "diagram"` for Diagram tab, which correctly switched rendering to Viewer, but the ready-state signal was never added for the Viewer path.

## Impact

- Diagram tab permanently shows skeleton
- Canvas never becomes visible
- User cannot interact with diagram
- App is functionally broken for diagram viewing

## Fix Applied

1. Created `useDiagramLoadStateMachine` to replace boolean `diagramReady`
2. After `renderViewer` succeeds, call `transition("import_success")`
3. After `renderModeler` succeeds, call `transition("import_success")` as safety net
4. `trackRuntimeStatus` also calls `transition("import_success")` for Modeler runtime status
5. Added timeout/error states so skeleton never stays forever
