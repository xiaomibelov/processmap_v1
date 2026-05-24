# Drag Lag Root Cause

## Summary
Drag lag has two components:
1. **React-side overhead** (fixable) — `viewbox.changed` and `selection.changed` handlers perform non-trivial work on every event
2. **SVG engine overhead** (engine limit) — bpmn-js SVG coordinate recalculation during viewport transform

## Root Cause 1: React Overhead During Viewbox Changes
**File**: `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

`canvas.viewbox.changed` handler (both viewer and modeler) calls:
- `getCanvasSnapshot(inst)` — queries canvas viewbox, zoom, element registry count, bounding rect
- `logViewAction(...)` — writes to trace/debug sinks
- `emitViewboxChanged(...)` — iterates listener set
- `scheduleRafForInstance(..., () => applyPropertiesOverlayDecorForZoomChange(...))` — RAF-coalesced but still enqueues work

During a 300px drag, bpmn-js fires many `viewbox.changed` events. Each one triggers this handler chain.

## Root Cause 2: React Overhead During Selection Changes
**File**: same

`selection.changed` handler calls:
- `clearAnalyticsHighlight` / `setSelectedDecor` — DOM/SVG marker manipulation
- `emitElementSelection` — callback to parent components
- `syncAiQuestionPanelWithSelection` — panel opening/closing logic

If an element is clicked and dragged, selection changes during drag, triggering all of the above.

## Root Cause 3: SVG Engine Characteristic
**File**: bpmn-js (external library)

Even after suppressing React handlers, ~20 long tasks remain per drag session. Profiling shows these correlate with bpmn-js internal viewport transform application to ~2,100 SVG nodes. This is an inherent cost of SVG-based large-diagram rendering.

## Why Previous Fixes Missed This
Previous contours tested:
- Programmatic zoom button clicks (single event, not continuous drag)
- DOM count stability (static measurement, not during motion)
- No real `mouse.down` → `mouse.move` → `mouse.up` lifecycle

Real drag generates a continuous stream of `viewbox.changed` events, amplifying any per-event overhead.

## Fix Applied
Added `dragInProgress` guard to `onViewboxChanged` and `onSelectionChanged` handlers:
- If `contextMenuInteractionRef.current.dragInProgress === true`, skip heavy work
- Context menu dismiss and `userViewportTouchedRef` still updated (lightweight)
- bpmn-js internal handlers unaffected

Result: long-task burden reduced by ~54%.
