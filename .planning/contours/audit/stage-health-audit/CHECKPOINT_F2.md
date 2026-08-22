# Checkpoint F2 — BPMN stage runtime listener cleanup

**Files changed:**
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- `frontend/src/components/process/BpmnStage.jsx`

**Changes:**
- Added `recordEventBusListeners` helper that temporarily wraps `eventBus.on` and records every subscription for later `eventBus.off`.
- `bindContextMenuRuntimeEvents`, `bindViewerStageEvents`, and `bindModelerStageEvents` now return cleanup functions.
- `debounce`/`throttle` wrappers expose `.cancel()` and are cancelled on cleanup.
- `BpmnStage.jsx` now:
  - stores returned unbinders in refs,
  - calls them before re-binding viewer/modeler,
  - calls them in `destroyRuntime`,
  - guards viewer binding with `viewerDecorBoundInstanceRef` (modeler already had a guard).

**Verification:**

```bash
cd /opt/processmap-test/frontend
node --test src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.context-menu-owner.test.mjs \
            src/features/process/bpmn/stage/wiring/bpmnWiring.test.mjs
# 6 passed, 0 failed

npm run build
# ✓ built in 19.86s
```

**Expected runtime effect:** no accumulation of diagram-js `eventBus` or native container listeners when the viewer/modeler is re-initialized or unmounted; `MaxListenersExceededWarning` should stop appearing.

**Status:** ready for next fix.
