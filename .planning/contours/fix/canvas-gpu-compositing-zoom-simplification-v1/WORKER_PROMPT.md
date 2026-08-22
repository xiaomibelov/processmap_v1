# Agent 2 / Worker Prompt

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Language**: Reports in Russian. Code comments in English.

---

## Your Mission
Implement GPU compositing and zoom simplification for the BPMN canvas to achieve ≥55 FPS pan on large diagrams. Do NOT remove DOM nodes.

## Context
- Previous contour `fix/canvas-overlay-debounce-v1` improved FPS to ~50 but user still perceives lag.
- Hypothesis: lag is paint/composite cost of 3754 SVG nodes, not overlay updates.
- Previous contour `fix/canvas-viewport-culling-v1` was REVERTED — DO NOT repeat culling.

## Scope

### 1. CSS GPU Compositing
- Add CSS rules to promote bpmn-js SVG canvas to GPU layer during pan.
- Add JS hook to toggle `pan-active` class on `canvas.viewbox.changing` / `canvas.viewbox.changed`.
- Add CSS containment (`contain: layout paint style`) to `.djs-container`.

### 2. Zoom Simplification
- At zoom < 0.4: hide icons and corner markers inside shapes (keep rect + text).
- At zoom < 0.2: hide connection labels.
- Use CSS class-based approach (zoom-level class on container) preferred; custom renderer only if CSS insufficient.
- Must preserve click/hover/selection at all zooms.

### 3. Connection Line Simplification (if feasible)
- At zoom < 0.3: render connections as straight lines instead of routed paths (CSS or renderer hook).

## Forbidden (STOP if tempted)
- **NO DOM node removal / culling** — shapes must NEVER leave DOM.
- **NO `display:none` on shape root elements** — breaks hit testing.
- **NO `innerHTML` manipulation.**
- **NO bpmn-js core modification** (`node_modules/` read-only).
- **NO backend changes.**
- **NO overlay debounce changes** — already done.
- **NO scrubber/minimap changes.**

## Target Files
- `frontend/src/components/process/BpmnStage.jsx` — event hooks, zoom class toggle.
- `frontend/src/styles/app.css` or `frontend/src/styles/legacy/legacy_bpmn.css` — CSS rules.
- Optional: new utility module for zoom-level logic.

## Deliverables (all in Russian, place in contour directory)
1. `WORKER_REPORT.md` — summary of changes.
2. `GPU_COMPOSITING_IMPLEMENTATION.md` — what was done, where, why.
3. `ZOOM_SIMPLIFICATION.md` — what was done, where, why.
4. `LAYERS_PANEL_VERIFICATION.md` — DevTools evidence.
5. `BEFORE_AFTER_MEASUREMENTS.md` — FPS and paint time before/after.
6. `RUNTIME_PROOF_5177.md` — `curl` proof, screenshot evidence.
7. `WORKER_DONE` — empty marker file.
8. `EXEC_BLOCKED.md` — only if blocked.

## Measurement Requirements
- Measure FPS during 3-second pan on large diagram (428 elements).
- Screenshot DevTools Layers panel during pan.
- Screenshot DevTools Performance profile (Paint vs Composite).
- Verify small diagram (≤10 elements) still 60 FPS.

## Acceptance for Your Work
- FPS ≥ 55 on large diagram.
- DevTools Layers shows GPU layer.
- No shapes disappear.
- No console errors.
- Scrubber works.
