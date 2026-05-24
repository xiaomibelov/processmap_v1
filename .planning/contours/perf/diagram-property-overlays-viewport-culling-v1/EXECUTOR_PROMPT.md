# Agent 2 / Executor Prompt

## Contour

`perf/diagram-property-overlays-viewport-culling-v1`

## Your Role

Execute the bounded implementation plan in `PLAN.md`. You may modify **only** the frontend overlay rendering/performance code listed in the Source Map. You may **not** modify backend, package files, BPMN XML logic, Product Actions, RAG, AG-UI, versions head-check, or PUT /bpmn logic.

## Must Read Before Starting

1. `PLAN.md` (this contour)
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. Previous audit reports:
   - `.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/PERFORMANCE_AUDIT_REPORT.md`
   - `.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/SOURCE_MAP.md`
   - `.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/FIX_RECOMMENDATIONS.md`
5. `STATE.json`

## Baseline Capture (Before Code Changes)

Before modifying any file, open the runtime and capture:

- Session/path used for testing.
- Total DOM nodes: `document.querySelectorAll('*').length`
- `.djs-overlay` count: `document.querySelectorAll('.djs-overlay').length`
- `.fpcPropertyOverlay` count: `document.querySelectorAll('.fpcPropertyOverlay').length`
- Pan/zoom behavior (stable counts?).
- Tab switch behavior (stable counts? no duplicates?).

Record these in `PERFORMANCE_BEFORE_AFTER.md` under **Before**.

## Implementation Tasks

### Task 1 — Enable bounds reading

In `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js`:
- Export `readElementBounds` (currently `function readElementBounds(...)` at line 58).

In `frontend/src/features/process/bpmn/stage/decor/decorManager.js`:
- Import `readElementBounds` from `./overlayLayoutModel.js`.

### Task 2 — Add viewport culling to `applyPropertiesOverlayDecor`

In `frontend/src/features/process/bpmn/stage/decor/decorManager.js`, inside `applyPropertiesOverlayDecor`:

1. After reading `canvasZoom` and `zoomBucket` (around line 1663), compute viewport bounds:
   ```js
   const canvas = inst.get("canvas");
   const viewbox = canvas?.viewbox?.() || { x: 0, y: 0, width: 0, height: 0 };
   const BUFFER_PX = 200;
   const scale = Math.max(0.001, Number(viewbox.scale || canvasZoom || 1));
   const bufferModel = BUFFER_PX / scale;
   const viewportLeft = Number(viewbox.x || 0) - bufferModel;
   const viewportTop = Number(viewbox.y || 0) - bufferModel;
   const viewportRight = viewportLeft + Number(viewbox.width || 0) + bufferModel * 2;
   const viewportBottom = viewportTop + Number(viewbox.height || 0) + bufferModel * 2;
   ```

2. In the `previewEntries.forEach` loop, after resolving `el` (line ~1681), add:
   ```js
   const bounds = readElementBounds(el);
   if (bounds) {
     const elRight = bounds.x + bounds.width;
     const elBottom = bounds.y + bounds.height;
     const isVisible = elRight >= viewportLeft && bounds.x <= viewportRight && elBottom >= viewportTop && bounds.y <= viewportBottom;
     if (!isVisible) {
       return; // skip: do not add to nextState; stale cleanup will remove existing overlay
     }
   }
   ```

3. Keep `BUFFER_PX` as a named constant at the top of the function scope so it is easy to tune.

### Task 3 — Make trigger pan-aware

In `frontend/src/components/process/BpmnStage.jsx`:

1. Rename / restructure `applyPropertiesOverlayDecorForZoomChange` (line 4076) to track viewbox position, not just zoom bucket.
   - Read `canvas.viewbox()`.
   - Compute a viewbox signature that includes rounded `x`, `y`, and zoom bucket, e.g.:
     ```js
     const viewboxSig = `${Math.round(Number(vb.x || 0))}:${Math.round(Number(vb.y || 0))}:${zoomBucket}`;
     ```
   - Store signature in a ref (you may rename `propertiesOverlayZoomBucketRef` to `propertiesOverlayViewboxSigRef` or reuse the existing ref with a new shape).
   - Return early only if signature is unchanged.
   - Then call `applyPropertiesOverlayDecor(inst, mode)`.

2. Update the ref initialization at line 1286 if you change the ref name/shape.

### Task 4 — Optional: CSS class batching

If you choose to implement:
- In `decorManager.js:applyPropertiesOverlayContainerStyle()`, replace per-overlay CSS custom properties with predefined zoom-bucket CSS classes where safe.
- Keep truly dynamic values (e.g. `width`, `maxWidth`) as inline styles.
- Add classes to `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`.
- If this adds risk, skip it and document in `IMPLEMENTATION_NOTES.md`.

### Task 5 — Optional: RAF coalescing

If panning feels janky during testing:
- In `useBpmnSettledDecorFanout.js`, wrap the properties fanout effect body in a `requestAnimationFrame` queue that dedupes multiple triggers within the same frame.
- If not needed, skip and document.

## Validation Steps

1. Run frontend build/tests. Fix any test failures caused by the change.
2. Runtime validation:
   - Open Diagram tab with property overlays ON.
   - Record DOM counts → **After** section in `PERFORMANCE_BEFORE_AFTER.md`.
   - Pan to an area with no/few elements → `.fpcPropertyOverlay` count should drop.
   - Pan back → count should restore.
   - Zoom in/out → stable, no duplicates.
   - Switch to Analysis tab and back → stable counts, no duplicates.
   - Open browser console → no new errors.
   - Open Network tab → no `GET /bpmn/versions?limit=1` spikes caused by pan/zoom; no `PUT /bpmn` caused by overlay interactions.
3. Screenshot or paste console evidence into `PERFORMANCE_BEFORE_AFTER.md`.

## Forbidden Actions

- Do not modify backend code.
- Do not modify `package.json` or lock files.
- Do not modify BPMN XML parsing/generation logic.
- Do not modify Product Actions / RAG / AG-UI.
- Do not modify `ProcessStage.jsx` versions head-check logic.
- Do not modify save/publish/version logic.
- Do not commit, push, PR, or deploy.

## Deliverables

Create these files in the contour directory:

- `EXEC_REPORT.md` — what was done, what was skipped, blockers.
- `IMPLEMENTATION_NOTES.md` — exact changes per file, design decisions, constants chosen.
- `PERFORMANCE_BEFORE_AFTER.md` — baseline vs after metrics with evidence.
- `READY_FOR_REVIEW` — empty marker file when validation passes.

If blocked:
- Create `EXEC_BLOCKED.md` explaining the blocker.
- Do **not** create `READY_FOR_REVIEW`.
