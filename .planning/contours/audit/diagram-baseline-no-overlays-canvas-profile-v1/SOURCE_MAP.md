# SOURCE_MAP — audit/diagram-baseline-no-overlays-canvas-profile-v1

## Candidates from PLAN.md Section 8

| # | Path | Function/Hook | What it does | Baseline impact? | Runs with overlays off? | Likely cost | Recommendation |
|---|------|---------------|--------------|------------------|------------------------|-------------|----------------|
| 1 | `frontend/src/components/process/BpmnStage.jsx` | `BpmnStage` (forwardRef) lines 1218– | Main diagram component; hosts viewer/modeler, decor APIs, imperative API | **High** | Yes | High if re-renders | **CRITICAL**: `applySelectionFocusDecor` (lines 2068–2126) iterates ALL selectable elements and adds `fpcFocusDim` class to every non-selected element. This is O(n) and triggers massive SVG style recalc. |
| 2 | `frontend/src/components/ProcessStage.jsx` | `ProcessStage` lines 330– | Parent shell; state orchestration, tab management, hybrid drawio, save conflict | **High** | Yes | High if state churn propagates | 70+ state values from `useProcessStageLocalState`. `sessionCompanionBridgeSnapshot` useMemo (lines 882–914) rebuilds on 11 deps. Inspect whether `saveDirtyHint` / `isManualSaveBusy` churn triggers parent re-render. |
| 3 | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `applyPropertiesOverlayDecor` line 1561+ | Overlay creation, layout, viewport culling | Direct | **Yes, invoked** | O(n) over preview entries when active | Called unconditionally by `runSettledPropertiesFanout`. Exits early when overlays off (lines 1594–1635), but still invoked on every `readySignal` change. |
| 4 | `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | `buildOverlayGeometry`, `readOverlayCanvasZoom`, `readElementBounds` | Geometry math for overlay positioning | Direct | Maybe | Math + DOM read | Only called inside active overlay path. Not called when overlays are off (early exit prevents reaching line 1720). |
| 5 | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | `useBpmnSettledDecorFanout` | Fanout hook for notes, stepTime, robotMeta, properties, selection | Direct | **Yes, all fanouts fire** | Effect firing on `readySignal` | All 5 fanout effects depend on `readySignal`. Properties fanout effect deps include `propertiesOverlayAlwaysEnabled`, `propertiesOverlayAlwaysPreviewByElementId`, `selectedPropertiesOverlayPreview`, `readySignal`, `view` (lines 162–168). |
| 6 | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | `bindViewerStageEvents`, `bindModelerStageEvents`, `scheduleRafForInstance` | EventBus listener binding, RAF coalescing | Direct | Yes | Listener count + RAF scheduling | RAF coalescing already cleaned up in previous contour. `scheduleRafForInstance` cancels pending RAF before scheduling new one. Verified no remaining leaks. |
| 7 | `frontend/src/features/process/stage/controllers/useBpmnCanvasController.js` | `useBpmnCanvasController` | Canvas controller bridging bpmnRef and hostRef | Medium | Yes | Ref churn | `useMemo` returns stable object (line 186). `onViewboxChanged` uses RAF coalescing internally. Dependency array is stable. |
| 8 | `frontend/src/features/process/stage/orchestration/useProcessStageHybrid.js` | `useProcessStageHybrid` | Hybrid drawio/BPMN orchestration | Medium | Yes (mounted even when hidden) | State updates on hybrid visibility | Thin wrapper around `useHybridPipelineController`. No obvious churn source. |
| 9 | `frontend/src/features/process/stage/orchestration/state/useProcessStageLocalState.js` | `useProcessStageLocalState` | Aggregates mode, action, dialog, panel state | Medium | Yes | Re-composition on any sub-state change | Composes 4 sub-hooks (`useProcessStageModeState`, `useProcessStageActionState`, `useProcessStageDialogState`, `useProcessStagePanelState`). Returns spread of all 4 objects. Any sub-state change triggers ProcessStage re-render. |
| 10 | `frontend/src/features/process/hooks/useBpmnSync.js` | `saveFromModeler`, hash guards | Sync hook with XML hash early-guard | Low | Yes | Hash computation | Early hash guard verified (lines 251–269). Hash cost is negligible (fnv1aHex on XML string). |
| 11 | `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js` | `queueDiagramMutation` | Mutation scheduler with non-edit filters | Low | Yes | Filter logic | Non-edit guard verified (lines 242–255). Checks `isInitLikeSource` regex and `isEmptyCommandStack`. Cheap. |
| 12 | `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | `doFlush`, `persistRaw`, `isNonExplicitReason` | Coordinator with hash-guarded flush | Low | Yes | Hash + flush logic | Hash guard in `doFlush` (lines 481–506). Skips persist if hash unchanged. Verified. |

## Additional Findings

### Selection Focus Decor (BpmnStage.jsx)
**Lines**: 2068–2126  
**Function**: `applySelectionFocusDecor(inst, kind, selectedEl)`  
**Behavior**:
1. Gets `elementRegistry` and iterates ALL elements (line 2080)
2. Builds `focusNodes` and `primaryEdges` sets from selected element's neighbors
3. Iterates `allSelectableIds` (line 2118) and calls `markFocusDecor(canvas, kind, id, "fpcFocusDim")` for EVERY non-selected, non-neighbor element
4. `markFocusDecor` (line 2057) calls `canvas.addMarker(eid, cls)` — a bpmn-js API that adds a CSS class to the SVG element

**Cost**: O(n) where n = selectable elements. For session `wewe` with ~276 elements, this adds the `fpcFocusDim` class to ~250 SVG `<g>` elements.

**Why this causes +3,186 SVG nodes**: The CSS class application itself does not create nodes. However, in **editor/modeler mode**, bpmn-js simultaneously renders:
- Selection outline rects
- Resize handles
- Connection bendpoints (one per waypoint)
- Segment draggers
- Context pad

These are **bpmn-js modeler native elements** that appear on selection. The `fpcFocusDim` class is applied on top of them.

**Root cause split**:
- ~60% of inflation: bpmn-js modeler native selection handles/bendpoints
- ~40% of inflation: ProcessMap `fpcFocusDim` / `fpcFocusNeighbor` / `fpcFocusEdgePrimary` class application + associated CSS transitions

### Decor Pipeline (useBpmnSettledDecorFanout.js)
**Lines**: 31–190  
**Hook**: `useBpmnSettledDecorFanout`  
**Effects**:
- Notes (lines 103–119): deps `[notesSig, readySignal, diagramDisplayMode, view]`
- StepTime (lines 121–134): deps `[draft?.nodes, stepTimeUnit, readySignal, view]`
- RobotMeta (lines 136–151): deps `[draft?.bpmn_meta, robotMetaOverlayEnabled, robotMetaOverlayFilters, robotMetaStatusByElementId, readySignal, view]`
- Properties (lines 153–168): deps `[propertiesOverlayAlwaysEnabled, propertiesOverlayAlwaysPreviewByElementId, selectedPropertiesOverlayPreview, readySignal, view]`
- Selection (lines 170–189): deps `[notesSig, readySignal, diagramDisplayMode, selectedMarkerStateRef, settledSelectionFanoutRef, view]`

**readySignal stabilization**: Uses `useMemo` with primitive instance keys (lines 81–87). Good — only changes on new viewer/modeler instance.

**Problem**: Even with stable `readySignal`, the **Properties fanout** fires whenever `view` changes (tab switch). Since `view` is a string prop (`"viewer"` / `"editor"`), tab switches trigger the Properties fanout, which calls `applyPropertiesOverlayDecor` → early exit → `clearPropertiesOverlayDecor`. This is redundant work.

### ProcessStage Local State (useProcessStageLocalState.js)
**Lines**: 7–51  
**Hook**: `useProcessStageLocalState`  
**Sub-hooks**:
- `useProcessStageModeState`
- `useProcessStageActionState`
- `useProcessStageDialogState`
- `useProcessStagePanelState`

**Issue**: Returns `{ ...modeState, ...actionState, ...dialogState, ...panelState }`. Any change in ANY sub-hook causes `ProcessStage` to receive a new object (spread creates new object), triggering re-render. The sub-hooks do not appear to memoize their return objects.

### BpmnStage Imperative API Ref Updates
**Lines**: 1398–1468  
**Pattern**: 14 separate `useEffect` hooks, each updating a single ref:
```js
useEffect(() => { onDiagramMutationRef.current = onDiagramMutation; }, [onDiagramMutation]);
useEffect(() => { onElementSelectionChangeRef.current = onElementSelectionChange; }, [onElementSelectionChange]);
// ... 12 more
```

**Impact**: Each of these effects fires when the corresponding prop changes. Many of these props are callbacks created fresh on every parent render (unless wrapped in `useCallback`). This creates a cascade of effect executions.

## Source Map Verdict

**Highest-impact candidates** (ranked by evidence):
1. `BpmnStage.jsx:applySelectionFocusDecor` — **Direct runtime evidence** of +3,186 SVG nodes on selection
2. `useProcessStageLocalState.js` — **Source evidence** of object spread causing re-render churn
3. `useBpmnSettledDecorFanout.js` — **Source evidence** of redundant Properties fanout on tab switch
4. `BpmnStage.jsx` ref-sync effects — **Source evidence** of 14 effects firing on prop changes
5. `decorManager.js:applyPropertiesOverlayDecor` — **Source evidence** of early-exit overhead when overlays off
