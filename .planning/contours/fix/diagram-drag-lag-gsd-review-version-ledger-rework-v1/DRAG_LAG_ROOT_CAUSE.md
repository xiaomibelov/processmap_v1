# Drag Lag Root Cause

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Root Cause 1: React State Updates During Drag (Partially Fixed in Previous Contour)

**Location**: `wireBpmnStageRuntimeEvents.js`

**Problem**: `selection.changed` and `canvas.viewbox.changed` handlers were calling:
- `syncAiQuestionPanelWithSelection`
- `setSelectedDecor`
- `emitElementSelection`
- `getCanvasSnapshot`
- `logViewAction`
- `applyPropertiesOverlayDecorForZoomChange`

**Fix (previous contour)**: Added `isDragInProgress()` guard to skip these handlers during drag.

**Status**: ✅ Fixed in previous contour.

---

## Root Cause 2: commandStack.changed Triggers Decor Fanout During Element Drag (NEW)

**Location**: `wireBpmnStageRuntimeEvents.js` → `bindModelerStageEvents` → `onCommandStackChanged`

**Problem**: During element drag in Modeler mode, bpmn-js fires `commandStack.changed` on every position update. The handler calls:
```js
invalidateShapeTitleLookup(inst.get("elementRegistry"));
runImmediateEditorFanout({
  inst,
  applyTaskTypeDecor,
  applyLinkEventDecor,
  applyHappyFlowDecor,
  applyRobotMetaDecor,
});
```

`runImmediateEditorFanout` applies 4 decoration layers synchronously. On a large diagram with 2,100+ SVG nodes, this creates long tasks during every drag frame.

**Fix (this contour)**: Added `isDragInProgress()` guard at the top of `onCommandStackChanged`:
```js
const onCommandStackChanged = () => {
  if (isDragInProgress(contextMenuInteractionRef)) {
    // Suppress expensive decor fanout during active drag to reduce lag
    return;
  }
  // ... existing logic
};
```

**Status**: ✅ Fixed in this contour.

---

## Root Cause 3: Read-only Default Blocks Element Drag

**Location**: `BpmnStage.jsx` → `forceEditorMode` default `false`

**Problem**: NavigatedViewer (view mode) was the default for the Diagram tab. Element drag is impossible in view mode.

**Fix (this contour)**: Changed default to `true`, extracted to `diagramEditModeBoundary.js`.

**Status**: ✅ Fixed in this contour.

---

## Root Cause 4: `hasHiddenParentStyles` Blocks Modeler Init on opacity:0 Parent (NEW — Post-Review)

**Location**: `BpmnStage.jsx` → `hasHiddenParentStyles`

**Problem**: `ensureModeler()` calls `waitForNonZeroRect` which calls `hasHiddenParentStyles(node, 3)`. This function returned `true` if any parent within 3 levels had `opacity === "0"`. During initial React mount, an ancestor div had `opacity: 0` due to CSS transitions. This caused `layout_not_ready_before_modeler_init` to be thrown indefinitely, making Modeler default impossible.

**Fix**: Removed `style.opacity === "0"` from `hasHiddenParentStyles`. Only `display === "none"` and `visibility === "hidden"` are now checked.

**Rationale**: An `opacity: 0` parent does not prevent bpmn-js SVG initialization. The SVG renders correctly and becomes visible when the parent transitions to `opacity: 1`.

**Status**: ✅ Fixed in this contour (rework).

---

## Root Cause 5: Parent Shell Churn (Investigated, Not Primary)

**Location**: `useProcessTabs.js`, `ProcessStage.jsx`

**Investigation**: Checked for state updates during drag. `selectedElementContext` is memoized. `flushFromActiveTab` only fires on tab switch, not during drag.

**Status**: ⚠️ Documented as low impact.

---

## Root Cause 6: bpmn-js SVG Engine Limits (Hypothesis)

**Location**: bpmn-js internal SVG rendering

**Hypothesis**: Even with all React-side guards, bpmn-js SVG coordinate updates during continuous drag may still produce long tasks on 7,700-node diagrams.

**Test**: If Agent 3 still observes material lag after all React guards, this hypothesis is confirmed.

**Status**: ⏳ Pending Agent 3 verification.

---

## Summary

| Root Cause | Fix Applied | Contour |
|-----------|-------------|---------|
| React state updates during drag (selection/viewbox) | `isDragInProgress` guard | Previous |
| `commandStack.changed` → decor fanout during element drag | `isDragInProgress` guard | **This** |
| Read-only default blocks element drag | Modeler default + boundary extraction | **This** |
| `hasHiddenParentStyles` opacity check blocks Modeler init | Removed opacity check from parent scan | **This** (rework) |
| Parent shell churn | Low impact, no fix needed | — |
| bpmn-js SVG engine limits | Hypothesis, needs verification | ⏳ |
