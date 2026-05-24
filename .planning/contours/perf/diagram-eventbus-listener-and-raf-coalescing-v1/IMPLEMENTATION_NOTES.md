# IMPLEMENTATION_NOTES — perf/diagram-eventbus-listener-and-raf-coalescing-v1

## 1. RAF Coalescing for Viewbox Overlay Refresh

### Location
`frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

### Pattern
Mirrors the canonical RAF/debounce pattern from `useBpmnViewportSource.js`:

- **Module-level WeakMap** `rafTokens` maps diagram instances to pending RAF tokens.
- **`scheduleRafForInstance(inst, fn)`**: cancels any pending RAF for the instance, then schedules a new `requestAnimationFrame`. Inside the RAF callback, the token is removed from the WeakMap and `fn()` is invoked.
- **`cancelRafForInstance(inst)`**: cancels and removes any pending token.

### Application
In both `bindViewerStageEvents` and `bindModelerStageEvents`, the `canvas.viewbox.changed` handler now calls:

```js
scheduleRafForInstance(inst, () => {
  applyPropertiesOverlayDecorForZoomChange(inst, "viewer"); // or "editor"
});
```

instead of calling `applyPropertiesOverlayDecorForZoomChange` directly.

All other viewbox handler logic (context menu dismiss, snapshot, logging, `emitViewboxChanged`) remains synchronous and unchanged.

### Cleanup
Each returned cleanup function calls `cancelRafForInstance(inst)` to ensure no pending RAF fires after the instance is destroyed or replaced.

---

## 2. EventBus Listener Cleanup / Idempotency

### Location
`frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

### Problem
Previously, `bindViewerStageEvents` and `bindModelerStageEvents` registered many `eventBus.on` listeners but never unregistered them. Only the native `contextmenu` DOM listener had cleanup via `canvas.destroy`. If instances were recreated, listeners accumulated.

### Solution

#### `bindContextMenuRuntimeEvents`
- Now returns a `cleanup()` function.
- All eventBus listeners use stable named handler references (`onElementContextMenu`, `onCanvasContextMenu`, `onDirectEditingActivate`, etc.).
- Cleanup removes:
  - Native `contextmenu` listener from `contextMenuOwner`
  - `canvas.destroy` handler from eventBus
  - All other eventBus listeners via `eventBus.off(event, handler)`
  - Pending RAF token

#### `bindViewerStageEvents`
- Returns `cleanup()` function.
- Stable handler refs: `onSelectionChanged`, `onViewboxChanged`.
- Cleanup removes `selection.changed` and `canvas.viewbox.changed` listeners plus context-menu cleanup.

#### `bindModelerStageEvents`
- Returns `cleanup()` function.
- Stable handler refs: `onShapeReplacePre`, `onShapeReplacePost`, `onCommandStackChanged`, `onSelectionChanged`, `onViewboxChanged`.
- Cleanup removes all 5 eventBus listeners plus context-menu cleanup.

### Wiring in `BpmnStage.jsx`
- Added `viewerStageCleanupRef` and `modelerStageCleanupRef`.
- Before calling `bindViewerStageEvents` on a new instance: invoke previous cleanup if any.
- Before calling `bindModelerStageEvents` on a new instance: invoke previous cleanup if any.
- In `destroyRuntime`: invoke both cleanups and null out the refs.

---

## 3. Stabilize `readySignal` in `useBpmnSettledDecorFanout`

### Location
`frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`

### Problem
`readySignal` was computed on every render:

```js
const readySignal = [
  viewerRef.current ? 1 : 0,
  modelerRef.current || modelerRuntimeRef.current?.getInstance?.() ? 1 : 0,
].join(":");
```

Because `viewerRef.current` and `modelerRef.current` are refs (not state), reading them on every render produced a new string every time. This string was a dependency of all 5 `useEffect` fanout hooks, causing unnecessary fanout execution even when instance readiness had not changed.

### Solution
- Added `viewerInstanceKey` and `modelerInstanceKey` props.
- In `BpmnStage.jsx`, these are derived from `viewerInstanceMetaRef.current?.id` and `modelerInstanceMetaRef.current?.id`, which are incremented integers that change only when a new viewer/modeler instance is created.
- `readySignal` is now wrapped in `useMemo`:

```js
const readySignal = useMemo(
  () => [
    viewerInstanceKey ? 1 : 0,
    modelerInstanceKey ? 1 : 0,
  ].join(":"),
  [viewerInstanceKey, modelerInstanceKey],
);
```

This ensures `readySignal` only changes when a new instance is actually created, eliminating spurious fanout re-fires.

### Trade-offs
- `useMemo` with primitive dependencies is reliable and cheap.
- The instance keys are set imperatively in `ensureViewer` / `ensureModeler` right before `bind*StageEvents` is called. Because React re-renders the component after async initialization completes, the latest key values are passed to the hook.
- If instance creation and binding happen during the same render pass, the effect will fire exactly once when the key transitions from old to new.

---

## 4. Preserved Behavior

| Previous Fix | Status |
|--------------|--------|
| Viewport-culling (`decorManager.js`, `overlayLayoutModel.js`) | Untouched |
| Versions head-check dedupe | Untouched |
| Non-edit PUT/PATCH guard | Untouched |
| Overlay DOM structure | Untouched |
| Product Actions / RAG / AG-UI | Untouched |
| BPMN XML semantics | Untouched |

---

## 5. Risks

1. **Ref identity in eventBus cleanup**: Mitigated by using stable named handler references extracted to local constants before registration.
2. **RAF timing with viewport-culling**: The 1-frame delay is bounded and acceptable. The existing zoom-bucket signature guard inside `applyPropertiesOverlayDecorForZoomChange` still prevents redundant work.
3. **ReadySignal side effects**: Verified that fanouts still fire on initial load (key transitions from `0:0` to `1:1`) and after tab return (instance keys remain stable if instances are reused, or transition if recreated).
