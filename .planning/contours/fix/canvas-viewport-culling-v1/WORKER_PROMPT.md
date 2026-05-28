# Agent 2 / Worker Prompt

## Identity
- Role: Agent 2 / Worker for ProcessMap
- Contour: `fix/canvas-viewport-culling-v1`
- Run ID: `20260528T084215Z-64895`
- Output: Reports in **Russian**

## Task
Implement viewport-aware rendering for the BPMN canvas to eliminate pan lag on large diagrams.

## Audit Evidence (read-only)
- `audit/canvas-performance-diagnosis-v1/AUDIT_REPORT.md`
- Large diagram (428 elements): FPS during pan ~30, SVG nodes 3754, long tasks 148 ms.
- Small diagram (9 elements): FPS 60, no lag.
- Bottleneck: DOM/SVG creation. Browser recalculates thousands of SVG nodes during pan.

## Scope

### Must Implement

#### 1. Viewport Culling (PRIMARY)
- Hook into `canvas.viewbox.changed` event.
- Calculate visible rectangle from `canvas.viewbox()`.
- Iterate all shapes/connections via `elementRegistry.getAll()`.
- **Off-screen**: detach SVG `gfx` group from DOM, keep reference for re-attachment.
- **On-screen**: re-attach detached `gfx` to correct layer.
- Buffer: 200 px (configurable constant).
- Connections crossing viewport must remain fully visible.

**Expected files:**
- `frontend/src/components/process/BpmnStage.jsx` — add `cullViewport()` function and viewbox hook
- Optional: `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js`

**Fallback:** If detaching `gfx` breaks bpmn-js event handling, use `display: none` instead. Document the fallback and adjust measurement reporting to count "visible SVG nodes".

#### 2. Zoom Thresholds
- At zoom < 0.2: hide inner shape icons, keep only bounding `<rect>` and labels.
- At 0.2 ≤ zoom < 0.5: simplify shapes to rectangles.
- At zoom ≥ 0.5: full rendering.
- Manipulate SVG children inside `.djs-shape` groups; do NOT rebuild from scratch.

#### 3. Pan Debounce / RAF Throttle
- Throttle culling recomputation to every 3rd animation frame during fast pan.
- Do NOT throttle bpmn-js native canvas transform.
- Cancel previous RAF if new viewbox event arrives before execution.

#### 4. Overlay Lazy Loading (selection handles)
- In `decorManager.js`, before creating selection handles (`djs-bendpoint`, `fpcFocusDim`), check if shape is visible (gfx in DOM).
- Skip handle creation for off-screen shapes.
- Re-create handles when shape re-enters viewport while selected.

### Files Allowed to Modify
1. `frontend/src/components/process/BpmnStage.jsx`
2. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
3. `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
4. Optional new utility under `frontend/src/features/process/bpmn/stage/viewport/`

### Forbidden
- `node_modules/` (no bpmn-js core changes)
- Backend files
- `package.json` / lock files
- `ProcessStage.jsx`, `App.jsx` global state

## Performance Targets (hard)

| Metric | Before | Target |
|--------|--------|--------|
| Large diagram FPS during pan | ~30 | **≥ 45** |
| SVG nodes during pan (large) | 3754 | **≤ 1500** |
| Long tasks during pan (large) | 148 ms | **≤ 50 ms** |
| Small diagram FPS | 60 | **60** (no regression) |

## Implementation Order
1. Read PLAN.md, VIEWPORT_CULLING_SPEC.md, ZOOM_THRESHOLD_SPEC.md, PAN_DEBOUNCE_SPEC.md.
2. Capture **before** measurements on `:5177` (large + small diagram).
3. Implement viewport culling.
4. Test: pan to empty area → verify SVG count drops.
5. Test: pan back → verify SVG count restores.
6. Implement zoom thresholds.
7. Implement pan debounce.
8. Implement overlay lazy loading.
9. Capture **after** measurements.
10. Run build/tests.
11. Write deliverables.

## Deliverables (all in Russian)

| File | Content |
|------|---------|
| `WORKER_REPORT.md` | Summary, what was implemented, blockers |
| `VIEWPORT_CULLING_IMPLEMENTATION.md` | Algorithm, code locations, decisions |
| `ZOOM_THRESHOLD_LOGIC.md` | How thresholds work, what was simplified |
| `PAN_DEBOUNCE.md` | RAF throttle implementation details |
| `OVERLAY_LAZY_LOADING.md` | Selection handle culling logic |
| `BEFORE_AFTER_MEASUREMENTS.md` | Numbers before/after |
| `RUNTIME_PROOF_5177.md` | Runtime verification steps and results |
| `WORKER_DONE` | Empty marker file |

If blocked: write `EXEC_BLOCKED.md` and do NOT create `WORKER_DONE`.

## Runtime Verification Steps

1. Open `http://localhost:5177`.
2. Load large diagram (session `5425e68a8d`).
3. Open DevTools → Console.
4. Run baseline counts:
   ```js
   console.log('Total DOM:', document.querySelectorAll('*').length);
   console.log('SVG nodes:', document.querySelectorAll('svg *').length);
   console.log('Shapes:', document.querySelectorAll('.djs-shape').length);
   console.log('Connections:', document.querySelectorAll('.djs-connection').length);
   ```
5. Open DevTools → Performance.
6. Start 3-second recording.
7. Pan canvas continuously.
8. Stop recording.
9. Extract FPS and long tasks.
10. Repeat for small diagram.

## Blocker Escalation
- If `gfx` detach breaks bpmn-js: document in `EXEC_BLOCKED.md`, propose fallback (`display:none`).
- If tests fail: fix or document in `EXEC_BLOCKED.md`.
- If runtime not serving `:5177`: document in `EXEC_BLOCKED.md`.
