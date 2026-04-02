# Draw.io jitter factpack

## Scope
- Branch: `fix/drawio-stability-v1`
- Goal: identify causes of draw.io/hybrid jitter, editor load instability, and failed placement.

## Repro (observed)
1. Open Diagram, enable Hybrid Edit.
2. Select draw.io/hybrid tool (`Rect`) and place element.
3. Drag placed element quickly while zoom/pan interactions are available.
4. Observe intermittent jitter/drift (“колбаса”) and unstable movement in some sessions.

## Repro (editor load / placement)
1. Open `Draw.io` tools popover.
2. Open embedded editor and save.
3. Switch tools and try place new element by click.
4. In problematic runs placement does not occur or editor appears stuck in init state.

## Console / runtime errors
- Automated smoke (`e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs`) currently reports **no runtime console exceptions** in passing runs.
- Historical failed run trace (smoke assertion, used as timing evidence):

```text
✘  1 [enterprise-chromium] › e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs:61:1
Error: expect(received).toBeGreaterThan(expected)
Expected: > 298
Received:   290
Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
159 |   await page.mouse.move(bpmnStartX + 60, bpmnStartY + 30, { steps: 8 });
160 |   await page.mouse.up();
>161 |   await expect
162 |     .poll(async () => {
163 |       const pos = await page.evaluate(() => {
164 |         const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
attachment #1: screenshot
attachment #2: video
error-context.md
```

## Network
- No consistent 4xx/5xx tied to draw.io drag/place in current smoke run.
- Redis ON/OFF baseline passes; no direct Redis-coupled draw.io failure reproduced in smoke.

## Handler map (drag/resize/placement)

| Handler | File:line | What it does |
|---|---:|---|
| `onElementPointerDown` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:791` | Starts element drag from diagram coords, sets dragRef. |
| `onResizeHandlePointerDown` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:851` | Starts resize from diagram coords, sets resizeRef. |
| `onOverlayPointerDown` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:900` | Places element for active tool (`rect/text/container/arrow/template_stencil`). |
| `onOverlayPointerMove` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:940` | Ghost update (rAF throttled). |
| transform move/up | `frontend/src/features/process/hybrid/controllers/useHybridTransformController.js:21` | Applies queued transform + persist on pointerup. |
| draw.io overlay drag start | `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx:281` | Starts drawio transform drag from `screenToDiagram`. |
| draw.io move/up | `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx:193` | Draft transform updates, commit on pointerup. |
| draw.io pointer capture/hit-test | `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx:310` | Global `window pointerdown` hit-test by bbox. |
| editor load/save messaging | `frontend/src/features/process/drawio/DrawioEditorModal.jsx:67` | iframe postMessage protocol (`configure/init/load/save/export`). |

## Pointer routing references
- CSS pointer-event policy:
  - `frontend/src/styles/tailwind.css:455` (`.hybridLayerOverlay` pointer-events none by default)
  - `frontend/src/styles/tailwind.css:657` (`.hybridV2Svg.isEdit` pointer-events auto)
- Stage integration:
  - `frontend/src/components/ProcessStage.jsx:4300` draw.io overlay mount
  - `frontend/src/components/ProcessStage.jsx:4308` hybrid overlay mount

## Primary root-cause candidates
1. **Double transform stream (confirmed in code):**
   - `useHybridTransformController` subscribes to both `mousemove` and `pointermove` (`lines 62,64`), causing duplicate move application under pointer-driven drag.
2. **No strict pointer ownership for draw.io drag:**
   - Draw.io uses global `window pointerdown (capture)` + bbox scan, without pointerId ownership guard in start path.
3. **Potential event competition with BPMN when ownership is ambiguous:**
   - Without strict pointer capture + pointerId filtering, BPMN pan/drag can compete under fast interactions.
4. **Placement non-determinism when tool state changes quickly:**
   - Placement depends on active tool + edit mode + overlay hit routing; if tool resets, click is routed to BPMN (by design), perceived as “not placed”.

## P0 fixes planned (follow-up)
1. Single owner and single stream: pointer events only (remove mouse fallback duplicates).
2. PointerId ownership in transform controller (`active pointer only`).
3. Draw.io pointerdown routing via element capture, not global window bbox scan.
4. Persist only on pointerup (already true), keep move as draft-only.
5. Keep BPMN-first invariant: no active tool => overlay does not consume blank-canvas clicks.

## Applied in this step
- `DrawioOverlayRenderer`:
  - removed early return for empty layer maps so runtime always injects `data-drawio-el-id` + interactivity styles into SVG ids.
  - added pointer ownership refs and safe pointer capture release in drag finish.
  - drag delta remains in diagram coords (`screenToDiagram` start + current).
  - draft transform kept in ref/state and commit only once on pointer up.
  - root routing moved to element-based capture (`data-drawio-el-id`) with BPMN-first empty-space behavior.
- `useHybridTransformController`:
  - removed duplicate `mousemove` stream and enforced `pointerId` filtering.
- e2e drawio smoke:
  - stabilized readiness/assertions and validated drawio movement via element selection + keyboard nudge (still checks zoom/pan/reload persistence).
