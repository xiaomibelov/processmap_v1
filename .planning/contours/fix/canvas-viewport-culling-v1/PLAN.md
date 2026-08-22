# PLAN — Fix: BPMN Canvas Viewport Culling v1

## Contour Identity

| Field | Value |
|-------|-------|
| **Contour ID** | `fix/canvas-viewport-culling-v1` |
| **Type** | Fix (bounded frontend-only) |
| **Scope** | BPMN canvas viewport-aware rendering to reduce DOM/SVG cost during pan |
| **Runtime Target** | Frontend dev server `:5177` |
| **Backend Target** | None (backend untouched) |
| **Deliverables** | PLAN.md, WORKER_PROMPT.md, REVIEWER_PROMPT.md, WORKER_DONE, REVIEW_PASS |
| **Language** | Agent prompts in English. Reports/docs in Russian. |
| **Agent Run ID** | `20260528T084215Z-64895` |

---

## Audit Verdict

**Bottleneck: DOM/SVG creation overhead**

Source: `audit/canvas-performance-diagnosis-v1` (Run ID: 20260528T084215Z-64895)

| Metric | Small (9 elements) | Large (428 elements) |
|--------|-------------------|----------------------|
| FPS at rest | 60.4 | 60.5 |
| FPS during pan | 60 | **~30** |
| DOM nodes | 482 | 4145 |
| SVG nodes | 100 | **3754** |
| Long tasks (pan) | 0 | **148 ms** (83 + 65) |
| Overlays | 0 | 1 |
| Memory leak | false | false |
| Event listener leak | false | false |

Backend TTFB 363 ms affects initial load only, NOT pan.

Root cause: bpmn-js creates all SVG elements upfront. Pan forces browser to recalculate/layout/paint thousands of SVG nodes.

**Prior work:** `perf/diagram-property-overlays-viewport-culling-v1` successfully culled **property overlays** (`.fpcPropertyOverlay`) from 180 → 70, but did NOT reduce base SVG shape count. This contour targets the **base bpmn-js SVG layer** (`.djs-shape`, `.djs-connection`).

---

## Fix Strategy

### A. Viewport Culling (primary, high impact)
- Do NOT render SVG elements outside visible viewport.
- Hook into `canvas.viewbox.changed` event.
- Calculate visible rectangle from viewbox `{ x, y, width, height, scale }`.
- Iterate `elementRegistry.getAll()` shapes and connections.
- **Off-screen**: remove/detach SVG `gfx` group from DOM, keep reference for re-attachment.
- **On-screen**: re-attach stored `gfx` group to its layer.
- Buffer zone: 200 px in screen coordinates (configurable constant).
- Connections crossing viewport boundaries must render fully (use bounding-box intersection, not endpoint-only).

### B. Zoom Thresholds (medium impact, low effort)
- At zoom < 0.5 (50%): render simplified shapes (rectangles instead of detailed task icons).
- At zoom < 0.2 (20%): render only labels and connection lines, hide task shapes entirely.
- At zoom > 0.5: full rendering.
- Implementation: replace or hide detailed inner SVG paths inside `.djs-shape` groups.

### C. Pan Debounce / RAF Throttle (medium impact, low effort)
- During pan, throttle SVG culling updates to every 2nd or 3rd animation frame.
- Use `requestAnimationFrame` queue — skip intermediate frames during fast pan.
- Do NOT debounce the visual pan itself (must feel responsive).
- Debounce only the culling recomputation and overlay/label repositioning.

### D. Overlay Lazy Loading (medium impact)
- ProcessMap custom overlays (property badges, status indicators, selection handles) must ONLY render for visible elements.
- **Note:** Property overlay culling already implemented in prior contour. Ensure it continues to work.
- **New:** Selection handles (`djs-bendpoint`, `djs-outline`, `fpcFocusDim`) must also be culled when the underlying shape is off-screen.

### E. Connection Line Simplification (low effort)
- For connections entirely outside viewport → do not render (covered by A).
- For connections crossing viewport → render only visible segment (clip to viewport via SVG `<clipPath>` or bounding-box mask).

---

## Scope

Bounded frontend-only changes in:
- `frontend/src/components/process/BpmnStage.jsx` — viewport state, viewbox hook, culling orchestration
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` — bind `canvas.viewbox.changed` to culling function
- `frontend/src/features/process/bpmn/stage/decor/decorManager.js` — extend culling to selection overlays/handles
- Optional: new utility module `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js` — intersection math, element show/hide logic

## Non-goals

- Do NOT rewrite bpmn-js from scratch.
- Do NOT change backend BPMN XML generation.
- Do NOT reduce diagram functionality (zoom, select, edit must work).
- Do NOT implement full virtual scrolling (too complex for this contour).
- Do NOT touch backend.
- Do NOT modify `package.json` or add new dependencies.
- Do NOT change BPMN XML parsers or mutators.

---

## Architecture / Source Map

| Layer | File | Responsibility |
|-------|------|----------------|
| Canvas Host | `frontend/src/components/process/BpmnStage.jsx` | React component; owns viewer/modeler refs, viewport state |
| Event Wiring | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Binds `canvas.viewbox.changed` |
| Element Registry | bpmn-js `elementRegistry` | Provides `getAll()`, `getGraphics(element)` |
| SVG Layers | bpmn-js `canvas` | `.djs-layer-shape`, `.djs-layer-connection` |
| Overlay Manager | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Property overlays, selection handles |

### Safe change area for Agent 2
- Add viewport culling logic in BpmnStage.jsx or a new utility module.
- Read viewbox via `inst.get('canvas').viewbox()`.
- Read element bounds via `el.x, el.y, el.width, el.height` (shapes) or waypoint min/max (connections).
- Show/hide elements by detaching/reattaching `gfx` SVG groups.
- Extend zoom-change handler in BpmnStage.jsx with zoom-bucket thresholds.
- Add RAF-throttled culling scheduler.

### Forbidden change area
- bpmn-js core files under `node_modules/diagram-js/` or `node_modules/bpmn-js/`
- Backend / API / storage / schema
- `package.json` / lock files
- BPMN XML parsers or mutators
- `ProcessStage.jsx` network logic
- `App.jsx` global state

---

## Bounded Implementation Strategy

### 1. Viewport Culling Core

**Where**: New utility `cullBpmnViewport.js` or inside `BpmnStage.jsx`.

**What**:
1. Read canvas viewbox: `inst.get('canvas').viewbox()` → `{ x, y, width, height, scale }`.
2. Compute viewport rect in **model coordinates**:
   - `left = viewbox.x`
   - `top = viewbox.y`
   - `right = left + viewbox.width`
   - `bottom = top + viewbox.height`
3. Expand by buffer in model coords: `bufferModel = BUFFER_PX / Math.max(viewbox.scale, 0.001)`.
4. Expanded rect: `left - bufferModel`, `top - bufferModel`, `right + bufferModel`, `bottom + bufferModel`.
5. Get all elements: `inst.get('elementRegistry').getAll()`.
6. For each element:
   - If shape: bounds = `{ x, y, width, height }`.
   - If connection: bounds = min/max of waypoints.
   - Intersection test: `!(bounds.x + bounds.width < left || bounds.x > right || bounds.y + bounds.height < top || bounds.y > bottom)`.
7. For off-screen elements:
   - Get `gfx = elementRegistry.getGraphics(element)`.
   - If `gfx` is in DOM, detach with `gfx.remove()` and store in `detachedGfxMap`.
8. For on-screen elements:
   - If `gfx` is detached, re-append to correct layer (`shapeLayer` or `connectionLayer`).
   - Restore full rendering if zoom threshold allows.
9. For connections crossing viewport: always render fully (intersection test handles this).

**Buffer recommendation**: `200` px.

**Why detach instead of `display:none`:**
- `display:none` removes elements from render tree but keeps them in DOM. `querySelectorAll('svg *')` count does not decrease.
- Audit target explicitly requires reducing **SVG node count** to ≤1500 during pan.
- Detaching `gfx` groups literally removes nodes from DOM while preserving bpmn-js internal references.
- Re-attachment is fast because SVG nodes are already created; no re-parsing or re-rendering.

**Risk mitigation**: Keep `detachedGfxMap` keyed by element ID. On viewbox change, only toggle elements whose visibility state changed.

### 2. Zoom Thresholds

**Where**: Inside viewbox change handler, after culling.

**What**:
1. Read `viewbox.scale`.
2. If `scale < 0.2`:
   - For visible shapes: hide inner detailed paths, keep only label `<text>` and outer `<rect>`.
   - Connections remain visible.
3. If `0.2 ≤ scale < 0.5`:
   - For visible shapes: replace detailed icon paths with simple rectangle.
4. If `scale ≥ 0.5`:
   - Restore full shape rendering.

**Implementation**: manipulate SVG children inside `.djs-shape` groups. Hide/show specific child elements by class or tag name. Do NOT rebuild SVG from scratch.

### 3. Pan Debounce / RAF Throttle

**Where**: Culling trigger function.

**What**:
1. On `canvas.viewbox.changed`, schedule culling via `requestAnimationFrame`.
2. Maintain a frame counter: only execute culling every `CULLING_FRAME_SKIP` frames (default: 2).
3. If a new pan event arrives before scheduled frame executes, cancel previous RAF and reschedule.
4. The canvas `transform` itself is handled by bpmn-js natively and is NOT throttled.

### 4. Overlay Lazy Loading

**Where**: `decorManager.js` and BpmnStage.jsx selection handlers.

**What**:
1. Before adding selection handles (`djs-bendpoint`, `djs-outline`, `fpcFocusDim`), check if the shape's `gfx` is currently in DOM (not detached).
2. If shape is off-screen (detached), skip handle creation.
3. When shape re-enters viewport, re-evaluate selection state and create handles if selected.

---

## Performance Targets (must achieve)

After fix, re-run same audit measurements:

| Metric | Before | After | Verdict |
|--------|--------|-------|---------|
| Large diagram FPS during pan | ~30 | **≥ 45** | PASS required |
| SVG nodes during pan (large) | 3754 | **≤ 1500** | PASS required |
| Long tasks during pan (large) | 148 ms | **≤ 50 ms** | PASS required |
| Small diagram FPS | 60 | **60** (no regression) | PASS required |

---

## Worker Deliverables

Agent 2 / Worker must create:

| File | Required |
|------|----------|
| `WORKER_REPORT.md` | Yes |
| `VIEWPORT_CULLING_IMPLEMENTATION.md` | Yes |
| `ZOOM_THRESHOLD_LOGIC.md` | Yes |
| `PAN_DEBOUNCE.md` | Yes |
| `OVERLAY_LAZY_LOADING.md` | Yes |
| `BEFORE_AFTER_MEASUREMENTS.md` | Yes |
| `RUNTIME_PROOF_5177.md` | Yes |
| `WORKER_DONE` | Yes |
| `EXEC_BLOCKED.md` | Only if blocked |

Reports in **Russian**.

## Reviewer Gates

Agent 3 / Reviewer must verify:

1. Re-run audit measurements on `:5177`.
2. Verify FPS during pan ≥ 45 on large diagram.
3. Verify SVG nodes ≤ 1500 during pan.
4. Verify small diagram still 60 FPS.
5. Verify no functionality regression (zoom, select, edit).
6. Create PR to stage, do NOT merge.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Detaching `gfx` breaks bpmn-js event handling | Test click/selection after pan. If broken, fall back to `display:none` for shapes and accept SVG count target as "visible nodes ≤ 1500". |
| Zoom threshold hides important UI at low zoom | Keep labels and connections always visible. Only hide detailed task icons. |
| RAF throttle causes visible culling lag | Buffer zone (200 px) compensates. Reduce `CULLING_FRAME_SKIP` to 1 if needed. |
| Connection clipping incorrect | Use full bounding-box intersection, not endpoint-only. |
| Memory leak from `detachedGfxMap` | Use `Map` cleared on diagram import/unmount. No closures over DOM nodes. |

---

## Validation

- Source tests must pass (`npm run test` or equivalent).
- Runtime before/after DOM/SVG counts must show material reduction during pan.
- Pan/zoom must remain stable across 5+ cycles.
- No new console errors.
- No network mutation side effects from pan/zoom.
- `git diff --name-only` shows only bounded frontend files.

## Gates

- [x] Gate 1 — GSD discipline completed (manual)
- [x] Gate 2 — Audit source truth reviewed
- [x] Gate 3 — Runtime/source truth captured
- [x] Gate 4 — Architecture source map captured
- [x] Gate 5 — Bounded optimization strategy defined
- [x] Gate 6 — Non-goals locked
- [x] Gate 7 — Acceptance metrics defined (FPS ≥45, SVG ≤1500, long tasks ≤50ms)
- [x] Gate 8 — Worker prompt ready
- [x] Gate 9 — Reviewer prompt ready
- [ ] Gate 10 — READY_FOR_EXECUTION marker created
