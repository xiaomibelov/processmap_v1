# feature/diagram-analytics-layer-selection-lite-decomposition-first-v1

## GSD Discipline

### GSD Availability Check

Commands executed:
- `command -v gsd` → `/opt/processmap-test/bin/gsd`
- `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
- `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
- `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
- `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
- `find /root/.codex/agents -maxdepth 2 -type d -name 'gsd-*'` → checked

### GSD Mode

**GSD_PROCESSMAP_WRAPPER_PLANNING**

- `/opt/processmap-test/bin/gsd` is available and in PATH.
- `/root/.codex/get-shit-done/bin/gsd-tools.cjs` is present.
- `/root/.codex/skills` contains 50+ gsd-* skills.
- Planning uses GSD discipline with ProcessMap wrapper binding.

### Confirmations

- [x] Implementation not performed by Agent 1.
- [x] Product files not modified by Agent 1.
- [x] Contour bounded to frontend Diagram interaction/analytics layer only.
- [x] Decomposition-first rule applied.
- [x] Agent 2 / Agent 3 gates prepared.

---

## Previous Evidence Source Truth

### Contours Read and Cited

1. **audit/diagram-property-overlays-performance-gsd-v1** (REVIEW_PASS)
   - Diagram does NOT remount on tab switch.
   - Overlay DOM inflation confirmed.
   - versions head-check spam confirmed.
   - non-edit PUT /bpmn was observed.

2. **perf/diagram-property-overlays-viewport-culling-v1** (REVIEW_PASS)
   - `.fpcPropertyOverlay` count reduced from ~180 to ~70 in default viewport.
   - No duplicate overlays.
   - Pan/zoom counts stable.

3. **fix/bpmn-versions-head-check-dedupe-v1** (REVIEW_PASS)
   - `/bpmn/versions?limit=1` spam reduced ~80%.
   - Tab switching produced 0 extra limit=1 calls.
   - Overlay interactions produced 0 versions calls.

4. **fix/diagram-non-edit-put-bpmn-guard-v1** (REVIEW_PASS)
   - Diagram idle, pan/zoom, selection/hover, tab switch, XML ↔ Diagram, property panel open produced 0 PUT /bpmn and 0 PATCH /sessions.
   - 4-layer frontend defense implemented.

5. **perf/diagram-eventbus-listener-and-raf-coalescing-v1** (REVIEW_PASS)
   - eventBus cleanup and RAF coalescing implemented.
   - Interaction scenarios stable.
   - Subjective improvement was small.

6. **audit/diagram-baseline-no-overlays-canvas-profile-v1** (REVIEW_PASS)
   - **Critical findings:**
     - Baseline total DOM: **8,025 exact**
     - Baseline SVG: **2,392 exact**
     - Pan DOM delta: **0**
     - Selection DOM delta: **+3,201 to +3,423**
     - Selection is **dominant bottleneck** even with `.fpcPropertyOverlay = 0`
     - bpmn-js editor mode creates many bendpoint/segment dragger nodes
     - `BpmnStage.jsx:applySelectionFocusDecor` adds `fpcFocusDim` to ~250 non-selected elements
     - **Recommended direction: selection-lite / lightweight viewer/analytics interaction**

7. **fix/diagram-decor-pipeline-disable-when-overlays-off-v1** (REVIEW_PASS)
   - Overlays-off baseline remains exact: `.fpcPropertyOverlay=0`, total DOM=8,025, SVG=2,392
   - Tab switch stable.
   - No PUT/PATCH.
   - Selection inflation remains known bottleneck.

### Key Baseline Numbers Used

| Metric | Baseline | After Selection | Delta |
|--------|----------|-----------------|-------|
| Total DOM | 8,025 | ~11,250 | **+3,200 (+40%)** |
| SVG nodes | 2,392 | ~5,578 | **+3,186 (+133%)** |
| `.fpcPropertyOverlay` | 0 | 0 | 0 |
| `.fpcFocusDim` | 0 | ~907 elements | mass dimming |
| bpmn-js bendpoints | 0 | ~916 | editor handles |
| bpmn-js segment draggers | 0 | ~251 | editor affordances |

---

## Source / Runtime Truth

### Environment

| Item | Value |
|------|-------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-15T12:54:13+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git status -sb` | `fix/lockfile-sync-test` with pre-existing modifications from previous contours |
| API health | `{"ok":true,"status":"ok"}` |
| Frontend | HTTP 200 OK |

### Runtime Endpoints

- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API health: `http://clearvestnic.ru:8088/health`

### Pre-existing Modifications

`git diff --name-only` shows modifications from previous contours on branch `fix/lockfile-sync-test`. Agent 1 must not commit, push, or merge these. Agent 2 must work within the bounded contour and not broaden scope.

---

## Problem Statement

### Current Problematic Flow

```
User opens Diagram tab
→ ProcessStage always passes view="editor" to BpmnStage
  (buildProcessDiagramOverlayLayersProps.js:48)
→ BpmnStage renders editor/modeler layer, NOT viewer layer
→ User clicks BPMN element
→ bpmn-js editor selection fires (selection.changed event)
→ bendpoint handles / segment draggers created (+916 +251 nodes)
→ setSelectedDecor calls applySelectionFocusDecor
→ fpcFocusDim applied to ~250 non-selected elements (+907 nodes)
→ Total DOM inflation: +3,200 to +3,423 nodes
→ User just wanted to view properties/analytics
```

### Root Causes Identified

1. **ProcessStage always uses editor view**: `buildProcessDiagramOverlayLayersProps.js` line 48:
   ```js
   view: tab === "xml" ? "xml" : "editor",
   ```
   The "viewer" view is never passed, so the `NavigatedViewer` instance is never shown as the primary diagram.

2. **bpmn-js modeler selection creates editor affordances**: When the modeler instance is active, any `selection.changed` triggers bendpoint handles, segment draggers, and selection outlines for the entire diagram.

3. **ProcessMap focus dimming amplifies the cost**: `applySelectionFocusDecor` (BpmnStage.jsx:2068-2126) iterates all ~276 selectable elements and adds `fpcFocusDim` class to ~250 of them via `canvas.addMarker()`.

### Target Flow (Analysis/View Mode)

```
User opens Diagram tab
→ ProcessMap analytics layer intercepts/handlers selection
→ Lightweight selectedElementId / hoveredElementId stored locally
→ Lightweight highlight rendered (single selected element, no mass dimming)
→ Properties/analytics panel reads selectedElementId
→ No BPMN XML mutation
→ No commandStack.changed
→ No bpmn-js editor handles (or minimal if modeler still active)
→ No fpcFocusDim mass class update
```

---

## Target Architecture

### Variant 3: Lightweight Diagram Analytics Layer

- **Do NOT replace** BPMN canvas.
- **Do NOT** introduce WebGL.
- **Do NOT** rewrite bpmn-js integration.
- **Do NOT** continue fixing overlay DOM.
- **Separate** user viewing/analytics from heavy BPMN editor selection.

### Core Idea

A bounded analytics interaction module that:
1. Tracks `selectedElementId` and `hoveredElementId` locally.
2. Renders lightweight visual feedback (selected highlight, hover outline).
3. Avoids mass `fpcFocusDim` updates.
4. Keeps property/details panel functional.
5. Does not trigger bpmn-js editor selection in analysis/view mode if feasible.
6. Preserves explicit edit mode path.

---

## Mode Model

### Mode 1: Analysis/View Mode (Default)

- Default when user is analyzing/reading the diagram.
- No heavy bpmn-js editor selection if achievable.
- No edit handles/draggers if achievable.
- Lightweight click/hover selection via analytics layer.
- Analytics layer highlights selected element.
- Property/details panel can open.
- No durable mutation.
- No BPMN XML mutation.

### Mode 2: Edit Mode (Explicit)

- Activated explicitly when user wants to edit BPMN.
- Full bpmn-js editor/modeler interactions.
- Selection handles/draggers allowed.
- User can edit BPMN.
- Explicit save remains available.
- Previous save guards remain.

### Important: Current State of "View" vs "Editor"

**Critical finding from source map:**
- BpmnStage supports `view="viewer"` (NavigatedViewer) and `view="editor"` (Modeler).
- However, **ProcessStage NEVER passes `view="viewer"`**. It always passes `view="editor"` for the diagram tab.
- This means the app has been running the **editor modeler full-time** for all diagram interactions.

### MVP Mode Strategy

Because switching from always-editor to viewer/editor dual-mode is a **significant lifecycle/state-sync risk**, the MVP must NOT change the `view` prop from ProcessStage initially.

Instead, the MVP uses an **internal analytics mode** within the existing editor instance:
- Add `diagramAnalyticsModeEnabled` internal state.
- When enabled, intercept element clicks before they trigger full bpmn-js editor selection.
- Use lightweight selection instead.
- Disable mass `fpcFocusDim` in analytics mode.
- Keep the explicit edit path available (e.g., via existing context menu or toolbar action).

If Agent 2 source-mapping proves that switching `view` to `"viewer"` is safe and bounded, this can be evaluated as a follow-up optimization, but **NOT as the primary MVP**.

---

## God-file / Decomposition Risk

### Identified God Files

1. **`frontend/src/components/process/BpmnStage.jsx`** (~5,864 lines)
   - Contains: `applySelectionFocusDecor`, `setSelectedDecor`, `clearSelectionFocusDecor`, `markFocusDecor`, `emitElementSelection`, `emitElementSelectionChange`, `syncAiQuestionPanelWithSelection`
   - Contains: viewer/modeler lifecycle, render logic, imperative API
   - **Risk**: Direct modification will make this file even larger.

2. **`frontend/src/components/ProcessStage.jsx`** (~6,898 lines)
   - Contains: mode state, tab logic, diagram controls, prop drilling to BpmnStage
   - **Risk**: Adding ad-hoc mode logic here will increase coupling.

3. **`frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`** (~567 lines)
   - Contains: `bindViewerStageEvents`, `bindModelerStageEvents`, `selection.changed` handlers
   - **Risk**: Both viewer and editor event bindings call `setSelectedDecor` identically.

### Decomposition Targets

Agent 2 must extract BEFORE adding new logic:

#### Target 1: Selection Focus Decor Module

**Current location:** `BpmnStage.jsx` lines 2030-2143
**Extract to:** `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`

Functions to extract:
- `clearSelectionFocusDecor(inst, kind)`
- `markFocusDecor(canvas, kind, elementId, className)`
- `applySelectionFocusDecor(inst, kind, selectedEl)`
- `setSelectedDecor(inst, kind, elementId)`

Behavior-preserving extraction first. Same signatures. Same output. BpmnStage imports and calls them.

#### Target 2: Analytics Interaction Mode Controller

**New module:** `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js`

Responsibilities:
- Define `isDiagramAnalyticsMode()` / `isDiagramEditMode()` helpers.
- Store `analyticsSelectedElementId` and `analyticsHoveredElementId` locally (no BPMN mutation).
- Provide `shouldUseEditorSelection(mode)` helper.

#### Target 3: Diagram Analytics Selection Controller

**New module:** `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsSelection.js`

Responsibilities:
- Local `selectedElementId` / `hoveredElementId` state (refs or lightweight hook).
- Selection update from eventBus click events (not `selection.changed`).
- No BPMN mutation.
- No commandStack involvement.
- No editor handles.

#### Target 4: Selection Event Wiring Refactor

**Current location:** `wireBpmnStageRuntimeEvents.js` lines 350-382 (viewer) and 490-518 (editor)

Both `bindViewerStageEvents` and `bindModelerStageEvents` register `selection.changed` → `setSelectedDecor`.

Agent 2 must evaluate:
- Can `selection.changed` be intercepted/suppressed in analytics mode?
- Or should analytics mode use `element.click` instead, and suppress `selection.changed` side effects?

---

## Source Map

### Critical Paths

| Function / Concept | File | Lines | Role |
|-------------------|------|-------|------|
| `applySelectionFocusDecor` | `BpmnStage.jsx` | 2068-2126 | Iterates all elements, applies `fpcFocusDim` to ~250 |
| `setSelectedDecor` | `BpmnStage.jsx` | 2128-2143 | Applies `fpcElementSelected`, calls `applySelectionFocusDecor` |
| `clearSelectionFocusDecor` | `BpmnStage.jsx` | 2042-2055 | Clears focus markers |
| `markFocusDecor` | `BpmnStage.jsx` | 2057-2066 | Adds marker via `canvas.addMarker` |
| `emitElementSelection` | `BpmnStage.jsx` | 3252-3282 | Emits selection payload to ProcessStage |
| `emitElementSelectionChange` | `BpmnStage.jsx` | 3236-3250 | Calls `onElementSelectionChangeRef` |
| `syncAiQuestionPanelWithSelection` | `BpmnStage.jsx` | 3206-3234 | Opens/closes AI question panel overlay |
| `bindViewerStageEvents` | `wireBpmnStageRuntimeEvents.js` | 260-424 | Wires viewer eventBus, including `selection.changed` |
| `bindModelerStageEvents` | `wireBpmnStageRuntimeEvents.js` | 426-567 | Wires editor eventBus, including `selection.changed` |
| `onSelectionChanged` (viewer) | `wireBpmnStageRuntimeEvents.js` | 350-382 | Calls `setSelectedDecor`, `emitElementSelection` |
| `onSelectionChanged` (editor) | `wireBpmnStageRuntimeEvents.js` | 490-518 | Calls `setSelectedDecor`, `emitElementSelection` |
| `useBpmnSettledDecorFanout` | `useBpmnSettledDecorFanout.js` | 1-199 | Runs settled fanouts including Selection fanout |
| `buildBpmnDiagramOverlayLayersProps` | `buildProcessDiagramOverlayLayersProps.js` | 7-88 | **Always sets `view: "editor"` for non-XML tab** |
| `useProcessStageModeState` | `useProcessStageModeState.js` | 1-26 | Has `diagramMode` ("normal"), `commandModeEnabled` |
| `BpmnStage` render | `BpmnStage.jsx` | 5847-5858 | Shows viewer layer if `view === "viewer"`, editor if `view === "editor" \|\| "diagram"` |

### Prop / State Flow

```
ProcessStage
  → useProcessStageModeState → diagramMode="normal", commandModeEnabled
  → buildProcessDiagramOverlayLayersProps
    → bpmnStageProps.view = tab === "xml" ? "xml" : "editor"  (ALWAYS "editor")
  → ProcessDiagramOverlayLayers
    → BpmnStage (receives view="editor")
      → render: shows editor layer, hides viewer layer
      → bindModelerStageEvents
        → eventBus.on("selection.changed") → setSelectedDecor → applySelectionFocusDecor
        → emitElementSelection → onElementSelectionChange → ProcessStage
```

### Key Observation

The `NavigatedViewer` instance exists in BpmnStage (`ensureViewer` at line 4469), but the viewer layer is **never shown** because `view` is never `"viewer"`. This is a dormant code path.

---

## Decomposition-First Plan

### Phase 1: Behavior-Preserving Extraction (MANDATORY)

Agent 2 must complete ALL of these before adding any new behavior.

#### Step 1.1: Extract Selection Focus Decor

- **From:** `BpmnStage.jsx` lines 2030-2143
- **To:** `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`
- **Exports:**
  - `createSelectionFocusDecorController()` or individual functions
  - `clearSelectionFocusDecor(inst, kind, focusMarkerStateRef)`
  - `applySelectionFocusDecor(inst, kind, selectedEl, focusMarkerStateRef)`
  - `setSelectedDecor(inst, kind, elementId, { selectedMarkerStateRef, focusMarkerStateRef })`
- **Behavior preservation:**
  - Same DOM output for same input.
  - Same `focusMarkerStateRef` tracking.
  - BpmnStage imports and calls with identical args.

#### Step 1.2: Extract Selection Emission Logic

- **From:** `BpmnStage.jsx` lines 3236-3282
- **To:** `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js`
- **Exports:**
  - `emitElementSelectionChange(payload, { onElementSelectionChangeRef, selectedMarkerStateRef })`
  - `emitElementSelection(el, source, extra, { onElementSelectionChangeRef })`
- **Behavior preservation:** Same callbacks fired with same payloads.

#### Step 1.3: Run Build and Tests

- `npm run build` or `npm run test` in `frontend/`
- Ensure no regressions.
- Document in `DECOMPOSITION_REPORT.md`.

### Phase 2: Selection-Lite / Analytics Layer MVP

#### Step 2.1: Create Analytics Mode Controller

- **New file:** `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js`
- Responsibilities:
  - `isDiagramAnalyticsMode(modeRef)` — returns true when in analytics/view mode.
  - `isDiagramEditMode(modeRef)` — returns true when in explicit edit mode.
  - `createAnalyticsModeRef(initialMode)` — returns a ref object `{ current: "analytics" | "edit" }`.

#### Step 2.2: Create Analytics Selection State

- **New file:** `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsSelection.js`
- Responsibilities:
  - `createAnalyticsSelectionState()` — returns `{ selectedIdRef, hoveredIdRef, setSelected, setHovered, clear }`.
  - `getAnalyticsSelectedElementId(state)` — read selected id.
  - No BPMN mutation. No commandStack. No canvas.addMarker mass updates.

#### Step 2.3: Create Lightweight Highlight Layer

- **New file:** `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js`
- Responsibilities:
  - `applyAnalyticsHighlight(inst, kind, elementId)` — adds a single lightweight marker/class to selected element only.
  - `clearAnalyticsHighlight(inst, kind)` — removes the marker.
  - Does NOT iterate all elements.
  - Does NOT apply `fpcFocusDim`.
  - Optional: apply a subtle CSS class to the selected element only.

#### Step 2.4: Integrate into Event Wiring

- Modify `wireBpmnStageRuntimeEvents.js` OR create wrapper:
  - In analytics mode:
    - Intercept `element.click` or `selection.changed`.
    - If analytics mode is active, call analytics selection instead of `setSelectedDecor`.
    - Still call `emitElementSelection` so property panel works.
    - Do NOT call `applySelectionFocusDecor` (avoid mass dimming).
  - In edit mode:
    - Keep existing behavior unchanged.

#### Step 2.5: Connect Mode Toggle

- Evaluate existing UI for edit mode activation:
  - Context menu already has editing actions.
  - Toolbar has various diagram controls.
  - If no explicit toggle exists, the MVP can default to analytics mode for normal viewing, and enter edit mode via existing actions (e.g., "Редактировать" in sidebar or context menu).
- Do NOT introduce a confusing new user-facing mode switch unless absolutely necessary.
  - Internal MVP: analytics mode is default for normal diagram tab.
  - Edit mode activates when user performs an explicit edit action.

---

## Selection-Lite MVP Plan

### Recommended Strategy: Hybrid MVP (Option D)

Agent 1 recommends **Hybrid MVP** as the primary path because:

1. **Full viewer/editor switch (Option B)** is too risky for a single contour.
   - ProcessStage has never passed `view="viewer"`.
   - State sync between viewer and modeler is untested in production.
   - Selection continuity, undo/redo, and decor pipelines would need comprehensive validation.

2. **Suppressing editor selection inside modeler (Option A)** may be fragile.
   - bpmn-js internals may still create selection affordances even if suppressed at the event level.
   - Risk of breaking explicit edit mode.

3. **Removing fpcFocusDim only (Option C)** is too limited.
   - Would only remove ProcessMap's mass dimming.
   - bpmn-js editor handles (+~1,100 nodes) would remain.
   - Does not fully deliver the analytics layer concept.

4. **Hybrid MVP (Option D)** balances risk and impact:
   - First extracts focus decor (behavior-preserving).
   - Disables `fpcFocusDim` mass dimming in analytics mode.
   - Adds lightweight analytics selected state.
   - Reduces or suppresses editor selection affordances IF safe (Agent 2 to evaluate at source level).
   - Does not fully disable bpmn-js selection yet unless proven safe.
   - Keeps explicit edit mode working.

### Implementation Strategy Decision Tree

```
Agent 2 source-maps bpmn-js modeler selection internals
  → Can selection handles be suppressed via modeler config or API?
    → YES and safe → Option A-lite: suppress handles in analytics mode
    → NO or unsafe → Option D: keep modeler selection, disable fpcFocusDim, add lightweight highlight
  → Can view="viewer" be safely activated from ProcessStage?
    → YES and bounded → Document as follow-up contour recommendation
    → NO or too risky → Stick with Option D for this contour
```

### MVP Scope

**IN scope:**
- Extract selection focus decor module.
- Extract selection emission module.
- Create analytics mode controller.
- Create analytics selection state.
- Create lightweight highlight (single element, no mass iteration).
- Disable `fpcFocusDim` mass update in analytics/view mode.
- Keep property/details panel working.
- Keep explicit edit mode available.
- Document before/after DOM counts.

**OUT of scope (non-goals):**
- Switching `view` prop to `"viewer"` (too risky for MVP).
- Full bpmn-js Modeler → Viewer lifecycle switch.
- Removing bpmn-js.
- WebGL/canvas replacement.
- Backend changes.
- Package changes.
- Product Actions / RAG / AG-UI changes.

---

## Runtime Proof Plan

### Before Any Code Changes

Agent 2 must capture baseline using Playwright:

1. Open `http://clearvestnic.ru:5180`
2. Navigate to a project/session with BPMN diagram (e.g., project `b1c8a56b6e`, session `4c515d1c6e` from previous audits)
3. Open Diagram tab
4. Ensure overlays off if possible (`include_overlay=0`)
5. Record:
   ```js
   document.querySelectorAll('*').length
   document.querySelectorAll('svg *').length
   document.querySelectorAll('.fpcPropertyOverlay').length
   document.querySelectorAll('.fpcFocusDim').length
   document.querySelectorAll('.djs-bendpoint').length
   document.querySelectorAll('.djs-segment-dragger').length
   document.querySelectorAll('.djs-resizer').length
   ```
6. Click one BPMN task (e.g., `Activity_1c5b5zb`)
7. Record all counts again.
8. Document delta.

### After Extraction Only

- Run build/tests.
- Run same Playwright scenario.
- Expect NO delta from baseline (extraction must be behavior-preserving).
- Document in `DECOMPOSITION_REPORT.md`.

### After Selection-Lite MVP

- Run same Playwright scenario.
- In analytics/view mode, click same BPMN task.
- Record all counts.
- Target: `.fpcFocusDim` count should be 0 or near-0 in analytics mode.
- Target: Total DOM/SVG delta should be materially less than +3.2k, OR Agent 2 must document limitation if bpmn-js handles remain.
- Verify property panel still opens.
- Verify edit mode still accessible.

### Network Safety

- Verify 0 PUT /bpmn from selection/hover/pan/zoom/tab switch.
- Verify 0 PATCH /sessions from view interactions.
- Verify versions head-check dedupe not regressed.

---

## Acceptance Criteria

### Behavior / Decomposition

1. [ ] Relevant slice extracted from god files before new logic.
2. [ ] Extraction is bounded and behavior-preserving before feature changes.
3. [ ] New analytics layer / selection-lite module exists or equivalent bounded module exists.
4. [ ] ProcessStage/BpmnStage are not made larger with new ad-hoc logic.

### Runtime / Performance

5. [ ] In analysis/view mode, selecting/clicking BPMN element produces materially less DOM/SVG inflation than baseline +3.2k–3.4k, OR Agent 2 explicitly documents why MVP only removed ProcessMap `fpcFocusDim` first.
6. [ ] `.fpcPropertyOverlay` behavior is not regressed.
7. [ ] No unbounded DOM growth after selection/hover/pan/zoom.
8. [ ] No duplicate overlays.
9. [ ] No PUT /bpmn or PATCH /sessions from view-mode selection/hover/pan/zoom.
10. [ ] versions head-check dedupe not regressed.
11. [ ] Console has no new relevant errors.

### Functional

12. [ ] User can still click/select element for analytics/properties.
13. [ ] User can still enter explicit BPMN edit mode or existing editing workflow remains available.
14. [ ] Explicit save/edit path is not broken.
15. [ ] Property/sidebar selection behavior remains usable.
16. [ ] Analysis ↔ Diagram and XML ↔ Diagram tab switches remain stable.

### Scope

17. [ ] No backend changes.
18. [ ] No package changes unless explicitly approved.
19. [ ] No BPMN XML mutation from analysis/view interactions.
20. [ ] No Product Actions/RAG/AG-UI changes.
21. [ ] No broad app redesign.

### Measurement

22. [ ] Before/after DOM/SVG counts documented:
   - baseline before click;
   - after click in analysis/view mode;
   - compare to previous +3.2k–3.4k selection inflation.
23. [ ] Screenshots/evidence paths documented.

---

## Non-goals

- Do not replace bpmn-js.
- Do not introduce WebGL/canvas renderer.
- Do not implement full read-only viewer lifecycle unless source map proves it is safe and bounded.
- Do not rewrite Diagram architecture.
- Do not change backend.
- Do not change storage/schema.
- Do not change BPMN XML format.
- Do not change Product Actions/RAG/AG-UI.
- Do not redesign full Diagram UI.
- Do not remove editing capability.
- Do not hide all selection feedback.
- Do not remove property overlays feature.
- Do not add new dependencies.
- Do not mix this with registry UI/reester actions work.
- Do not mix this with AG-UI protocol work.
- Do not change the `view` prop from ProcessStage to `"viewer"` in this contour (document as future option).
- Do not commit, push, PR, or deploy.

---

## Agent 2 Execution Plan

Agent 2 must:

1. **Read:**
   - This `PLAN.md`
   - `RUNTIME_NAVIGATION.md`
   - `RUNTIME_PROOF_CHECKLIST.md`
   - `STATE.json`
   - Previous audit/review reports in `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/`

2. **Source-map before code:**
   - Read `BpmnStage.jsx` lines 2000-2150, 3200-3290, 5800-5864 in detail.
   - Read `wireBpmnStageRuntimeEvents.js` lines 340-420 and 490-560 in detail.
   - Read `buildProcessDiagramOverlayLayersProps.js` line 48 and surrounding context.
   - Identify exact `bpmn-js` selection internal APIs (modeling, selection service).
   - Determine if `selection.changed` can be intercepted/suppressed safely.
   - Determine if `modeler.get('selection').select([])` can be used to clear selection without side effects.

3. **Baseline before code:**
   - Use Playwright to open runtime.
   - Capture DOM/SVG selection delta.
   - Capture `fpcFocusDim` count.
   - Capture bpmn-js handles/draggers selectors/count.
   - Document in `PERFORMANCE_BEFORE_AFTER.md` (before section).

4. **Phase 1: Decomposition/Extraction**
   - Extract `selectionFocusDecor.js` from `BpmnStage.jsx`.
   - Extract `elementSelectionEmitter.js` from `BpmnStage.jsx`.
   - Update `BpmnStage.jsx` to import and call extracted modules.
   - Run build/tests.
   - Playwright proof: no runtime difference.
   - Document in `DECOMPOSITION_REPORT.md`.

5. **Phase 2: Selection-Lite / Analytics Layer MVP**
   - Create `diagramAnalyticsMode.js`.
   - Create `diagramAnalyticsSelection.js`.
   - Create `applyAnalyticsSelectionHighlight.js`.
   - Modify event wiring to use analytics selection in analytics mode.
   - Disable `fpcFocusDim` mass update in analytics mode.
   - Keep edit mode working.
   - Do not mutate BPMN XML.
   - Do not trigger PUT/PATCH.

6. **Validate:**
   - Build/tests.
   - Playwright runtime:
     - before/after counts;
     - tab switch;
     - edit mode safety;
     - network mutation safety;
     - previous fixes not regressed.

7. **Create reports:**
   - `EXEC_REPORT.md`
   - `DECOMPOSITION_REPORT.md`
   - `SELECTION_LITE_DESIGN.md`
   - `PERFORMANCE_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`

If blocked:
   - `EXEC_BLOCKED.md`
   - No `READY_FOR_REVIEW`.

---

## Agent 3 Review Plan

Agent 3 must:

1. **Read:**
   - This `PLAN.md`
   - `EXEC_REPORT.md`
   - `DECOMPOSITION_REPORT.md`
   - `SELECTION_LITE_DESIGN.md`
   - `PERFORMANCE_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `RUNTIME_PROOF_CHECKLIST.md`

2. **Source review:**
   - Verify decomposition happened before feature logic.
   - Verify large files did not get more ad-hoc logic.
   - Verify new modules are bounded.
   - Verify analysis/view selection is separate from edit selection.
   - Verify no backend/package/unrelated changes.

3. **Playwright runtime review:**
   - Open runtime.
   - Open Diagram.
   - Verify analysis/view selection works.
   - Count DOM/SVG before/after selection.
   - Compare with previous +3.2k–3.4k baseline.
   - Verify `fpcFocusDim` reduction if implemented.
   - Verify bpmn-js handles/draggers are reduced/suppressed in analysis/view if claimed.
   - Verify property/details panel still works.
   - Verify edit mode still available.
   - Verify no PUT/PATCH.
   - Verify no versions spam.
   - Verify overlays not regressed.
   - Verify console no new errors.

4. **Strict verdict:**
   - If even minor issue remains: `CHANGES_REQUESTED` + `REWORK_REQUEST.md`. No `REVIEW_PASS`.
   - If pass: `REVIEW_REPORT.md` + `REVIEW_PASS`.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| bpmn-js modeler selection cannot be safely suppressed | Medium | High | Fallback to Option D: disable fpcFocusDim only, document limitation |
| Extracting from BpmnStage.jsx breaks existing tests | Medium | Medium | Run all BpmnStage tests after extraction; fix imports |
| Property panel stops receiving selection events | Low | High | Ensure `emitElementSelection` still called in analytics mode |
| Edit mode accidentally disabled | Low | High | Explicit edit path testing; keep existing event wiring for edit mode |
| NavigatedViewer lifecycle temptation | Low | High | Explicitly out of scope for this contour; document as follow-up |
| `view="viewer"` switch looks easy mid-implementation | Medium | High | Stick to PLAN; any architecture change requires new contour planning |
| Previous contour fixes regressed | Low | High | Run full runtime proof checklist including network mutations |

---

## Gates

- [x] **Gate 1** — GSD discipline completed
- [x] **Gate 2** — Previous performance evidence read
- [x] **Gate 3** — Source/runtime truth captured
- [x] **Gate 4** — God-file/decomposition risk identified
- [x] **Gate 5** — Decomposition-first plan defined
- [x] **Gate 6** — Analytics layer MVP scope defined
- [x] **Gate 7** — Source map captured
- [x] **Gate 8** — Acceptance criteria defined
- [x] **Gate 9** — Non-goals locked
- [x] **Gate 10** — Agent 2 executor prompt ready
- [x] **Gate 11** — Agent 3 reviewer prompt ready
- [ ] **Gate 12** — READY_FOR_EXECUTION marker created (written after all files)
