# Decomposition Report

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Decomposition-First Compliance

Per PLAN.md: "If BpmnStage.jsx is touched for drag performance or edit mode, extraction is mandatory."

BpmnStage.jsx WAS touched for both edit mode and drag performance. Three modules were extracted BEFORE modifying behavior.

---

## Extracted Modules

### 1. `diagramEditModeBoundary.js`
**Path**: `frontend/src/features/process/bpmn/stage/interaction/diagramEditModeBoundary.js`

**Responsibility**:
- Owns `forceEditorMode` state.
- Decides Viewer vs Modeler default.
- Only resets on XML tab, NOT on Diagram tab.

**Why extracted**:
- BpmnStage.jsx is a god file (~5,850 lines).
- Edit mode logic was scattered across state declaration, useEffect, JSX, and imperative API.
- Extracting makes the default-mode decision testable and bounded.

**Interface**:
```js
function useDiagramEditModeBoundary({ view })
// Returns: { forceEditorMode, setForceEditorMode, enterEditMode, exitEditMode, isEditorActive, isViewerActive }
```

---

### 2. `diagramDragSideEffectGuard.js`
**Path**: `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js`

**Responsibility**:
- Central `dragInProgress` ref management.
- `isDragInProgress(contextMenuInteractionRef)` helper.
- `shouldSuppressSideEffectsDuringDrag` helper.

**Why extracted**:
- `wireBpmnStageRuntimeEvents.js` had inline `isDragInProgress` arrow functions in both `bindViewerStageEvents` and `bindModelerStageEvents`.
- Duplicated logic is hard to keep consistent.
- Extracted helper is testable and can be imported by other modules.

**Interface**:
```js
function createDragSideEffectGuardRef()
function isDragInProgress(contextMenuInteractionRef)
function shouldSuppressSideEffectsDuringDrag(contextMenuInteractionRef)
```

---

### 3. `diagramPointerMoveCoalescer.js`
**Path**: `frontend/src/features/process/bpmn/stage/interaction/diagramPointerMoveCoalescer.js`

**Responsibility**:
- RAF-coalesced UI updates during high-frequency events.
- `scheduleRafForInstance(inst, fn)`
- `cancelRafForInstance(inst)`

**Why extracted**:
- `wireBpmnStageRuntimeEvents.js` had inline `rafTokens` WeakMap and scheduling functions.
- These functions are generic and could be reused.
- Extracting removes ~40 lines from the orchestration module.

**Interface**:
```js
function scheduleRafForInstance(inst, fn)
function cancelRafForInstance(inst)
```

---

## BpmnStage.jsx Net Change

- Removed: `useState(false)` + `useEffect` reset logic (~8 lines)
- Removed: inline `forceEditorMode` boolean expressions in JSX (~4 lines)
- Added: `useDiagramEditModeBoundary` import and destructuring (~6 lines)
- Added: `isViewerActive` / `isEditorActive` usage in JSX (~4 lines)
- Added: "Просмотр" button (~12 lines)

Net change: ~+10 lines in BpmnStage.jsx, justified by decomposition.

---

## wireBpmnStageRuntimeEvents.js Net Change

- Removed: inline `rafTokens` WeakMap + `scheduleRafForInstance` + `cancelRafForInstance` (~40 lines)
- Removed: inline `isDragInProgress` arrow functions in viewer and modeler (~2 lines)
- Added: imports from `diagramDragSideEffectGuard.js` and `diagramPointerMoveCoalescer.js` (~4 lines)
- Added: `isDragInProgress(contextMenuInteractionRef)` calls (~4 lines)
- Added: `commandStack.changed` drag guard (~4 lines)

Net change: ~-30 lines, cleaner module.

---

## Status
✅ Decomposition-first applied. Three modules extracted. God file not bloated.
