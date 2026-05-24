# Canvas Lag Root Cause

## Finding
`buildProcessDiagramOverlayLayersProps.js` passed `view: "editor"` for **all non-XML tabs**.

```js
// BEFORE (line ~51)
view: tab === "xml" ? "xml" : "editor",
```

This meant the Diagram tab (analytics/view mode) received the same `view` prop as an explicit edit context. `BpmnStage` therefore always branched into the Modeler render path:
- Full bpmn-js `Modeler` instantiated
- Editing palette rendered
- Command stack + interceptors active
- Bendpoints rendered on selected connections
- Heavier SVG/DOM footprint

## Why Viewer Was Not Used
`BpmnStage` already had `viewerRef` and `ensureViewer()`, but the render effect had no branch for `view === "diagram"`. The `viewerRef` was only used for:
- Analytics highlight markers (`addMarker`/`removeMarker`)
- Subprocess preview
- Some overlay scenarios

The default `view === "editor"` path always called `renderModeler()`.

## Impact on Large Diagrams
For the test session (`wewe / Описание процессов Долгопрудный`):
- Modeler SVG descendants: ~2,392
- Viewer SVG descendants: ~2,154 (-238 elements, ~10% reduction)
- Modeler total DOM: ~8,026
- Viewer total DOM: ~7,717 (-309 elements)
- Modeler includes: palette DOM, command stack bindings, editing event handlers
- Viewer excludes: all of the above

## Fix
1. Parent prop now discriminates:
   ```js
   view: tab === "xml" ? "xml" : tab === "diagram" ? "diagram" : "editor",
   ```
2. `BpmnStage` render effect now branches:
   - `view === "editor" || forceEditorMode` → `renderModeler()`
   - `view === "diagram"` → `renderViewer()`

## Network / Mutation Safety
- Viewer mode does not load the Modeler command stack.
- No PUT `/bpmn` or PATCH `/sessions` triggered by view-only interactions.
- Explicit edit gesture (button click or direct editing event) required to activate Modeler.
