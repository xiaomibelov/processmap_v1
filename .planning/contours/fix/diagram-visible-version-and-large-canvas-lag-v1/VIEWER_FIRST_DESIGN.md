# Viewer-First Design

## Goal
Use lightweight `NavigatedViewer` for the Diagram tab by default, deferring heavy `Modeler` instantiation until the user explicitly requests edit mode.

## Architecture

```
┌─────────────────────────────────────────┐
│  Process tabs (Analysis/Diagram/XML...) │
├─────────────────────────────────────────┤
│  buildProcessDiagramOverlayLayersProps  │
│    view = "diagram" | "editor" | "xml"  │
├─────────────────────────────────────────┤
│           BpmnStage (forwardRef)        │
│  ┌─────────────────────────────────────┐│
│  │  Diagram layer (viewerEl)           ││
│  │  - NavigatedViewer                  ││
│  │  - "Редактировать BPMN" button      ││
│  │  - Visible when view="diagram"      ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │  Editor layer (editorEl)            ││
│  │  - Modeler                          ││
│  │  - Visible when view="editor"       ││
│  │    or forceEditorMode=true          ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

## State Machine

| User Action | view prop | forceEditorMode | Active Layer | Instance |
|-------------|-----------|-----------------|--------------|----------|
| Open Diagram tab | `"diagram"` | `false` | Diagram | Viewer |
| Click "Редактировать BPMN" | `"diagram"` | `true` | Editor | Modeler |
| Switch to XML tab | `"xml"` | `false` (reset) | — | — |
| Switch back to Diagram | `"diagram"` | `false` | Diagram | Viewer |
| Open in explicit edit context | `"editor"` | `false` | Editor | Modeler |

## Why NavigatedViewer Is Safe for Default
- `importXML` behavior identical to Modeler for display purposes.
- `canvas.addMarker()` / `canvas.removeMarker()` work on both instances.
- Pan/zoom provided by built-in `zoomscroll` + `movecanvas` modules.
- Selection events fire normally (`selection.changed`).
- Property panel receives selected element ID via existing callbacks.

## Edit Mode Trigger Paths
1. **Button click**: `onClick={() => setForceEditorMode(true)}`
2. **Runtime events**: `wireBpmnStageRuntimeEvents.js` binds `directEditing.activate`, `drag.start`, etc. These call `enterDiagramEditMode(analyticsModeRef)`, which in turn calls `setForceEditorMode(true)` via the imperative API.

## Lifecycle Caching
- Both Viewer and Modeler instances are cached in refs (`viewerRef`, `modelerRef`).
- Same-XML hash check prevents duplicate `importXML` on either instance.
- Switching layers does not destroy instances; it only toggles CSS `display`.
- This means returning to Viewer after Edit is instant (no re-import).

## Risks Mitigated
- **Edit mode broken**: Verified — button click + runtime events both trigger Modeler.
- **Tab switch leaves Modeler**: Mitigated by `useEffect` resetting `forceEditorMode` on view change.
- **Analytics broken**: Verified — `addMarker` works on Viewer.
- **Property panel broken**: Verified — selection callbacks fire normally.
