# SELECTION_LITE_DESIGN — feature/diagram-analytics-layer-selection-lite-decomposition-first-v1

**Run ID**: `20260515T125319Z-23963`  
**Executor**: Agent 2 / Executor  
**Date**: 2026-05-15

---

## Chosen Strategy: Option C / Hybrid MVP (Option D variant)

### Decision

Agent 2 evaluated the three primary options from the PLAN:

| Option | Approach | Risk Assessment | Verdict |
|--------|----------|-----------------|---------|
| **A** | Suppress `selection.changed` entirely in analytics mode | High — bpmn-js modeler internals may still create selection affordances; suppressing at eventBus level risks breaking explicit edit mode | Rejected |
| **B** | Let `selection.changed` fire, replace `setSelectedDecor` with analytics selection | Medium — safest because we don't fight bpmn-js event lifecycle; we only control ProcessMap's visual feedback | **Chosen** |
| **C** | Keep `selection.changed`, skip `applySelectionFocusDecor` only | Low — too limited; would only remove mass dimming but not introduce analytics layer concept | Partial (included in B) |

### Why Option B (Hybrid) Was Selected

1. **Does not suppress bpmn-js events** — `selection.changed` still fires naturally. This avoids fragile internal state manipulation.
2. **Replaces heavy visual feedback** — In analytics mode, `setSelectedDecor` (which calls `applySelectionFocusDecor` + mass `fpcFocusDim`) is replaced with `applyAnalyticsHighlight` (single lightweight marker).
3. **Keeps property panel working** — `emitElementSelection` is still called with identical payloads in both modes.
4. **Preserves edit mode exactly** — When mode switches to `"edit"`, the original `setSelectedDecor` path is restored without code duplication.
5. **Auto-detects edit gestures** — `bindModelerStageEvents` listens for `directEditing.activate`, `drag.start`, `create.start`, `connect.start`, `resize.start` and auto-switches to edit mode.

---

## Architecture

### Module Map

```
BpmnStage.jsx
  ├── analyticsModeRef { current: "analytics" | "edit" }
  ├── analyticsSelectedMarkerStateRef { viewer: "", editor: "" }
  ├── imports selectionFocusDecor.js (Phase 1)
  ├── imports elementSelectionEmitter.js (Phase 1)
  ├── imports diagramAnalyticsMode.js (Phase 2)
  ├── imports diagramAnalyticsSelection.js (Phase 2)
  ├── imports applyAnalyticsSelectionHighlight.js (Phase 2)
  ├── bindViewerStageEvents({ ..., analyticsModeRef, analyticsSelectedMarkerStateRef })
  └── bindModelerStageEvents({ ..., analyticsModeRef, analyticsSelectedMarkerStateRef })

wireBpmnStageRuntimeEvents.js
  ├── onSelectionChanged (viewer)
  │   └── if analyticsMode → applyAnalyticsHighlight + emitElementSelection
  │   └── if editMode → setSelectedDecor + emitElementSelection
  └── onSelectionChanged (editor)
      └── same branching
      └── auto-switch: directEditing.activate / drag.start / create.start / connect.start / resize.start → enterDiagramEditMode()
```

### Analytics Mode State Machine

```
[Diagram loads]
   │
   ▼
[analyticsMode = "analytics"] (default)
   │
   ├── User clicks element ──► applyAnalyticsHighlight("fpcAnalyticsSelected")
   │                           emitElementSelection (property panel works)
   │                           NO fpcFocusDim mass update
   │
   ├── User drags / edits text / creates shape / connects / resizes
   │   └── auto-switch ───────► [analyticsMode = "edit"]
   │
   └── User calls enterDiagramEditMode() imperatively
       └── ───────────────────► [analyticsMode = "edit"]

[analyticsMode = "edit"]
   │
   └── User clicks element ──► setSelectedDecor("fpcElementSelected")
                               applySelectionFocusDecor("fpcFocusDim" mass update)
                               emitElementSelection
                               Full editor affordances
```

### CSS for Analytics Highlight

```css
.bpmnCanvas .djs-element.fpcAnalyticsSelected .djs-visual > :is(rect, circle, ellipse, polygon) {
  stroke: var(--bpmn-selected-stroke) !important;
  stroke-width: 2.2px !important;
  filter: drop-shadow(0 0 8px var(--bpmn-selected-glow));
}
```

Mirrors `fpcElementSelected` styling but uses a distinct class name so analytics and edit selections don't conflict.

---

## Safety Measures

1. **No BPMN XML mutation** — analytics layer never touches `commandStack`, `modeling`, or `canvas` beyond `addMarker`/`removeMarker` for a single element.
2. **No PUT/PATCH** — verified at runtime; view interactions produce zero mutations.
3. **Previous fixes preserved** — overlay culling, versions dedupe, non-edit mutation guard, RAF coalescing, decor-off guard all remain untouched.
4. **Escape key clears both modes** — `clearSelectedDecor` now also calls `clearAnalyticsHighlight`.
