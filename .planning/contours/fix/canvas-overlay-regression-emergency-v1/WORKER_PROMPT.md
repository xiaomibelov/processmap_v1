# Worker Prompt — fix/canvas-overlay-regression-emergency-v1

**Contour**: `fix/canvas-overlay-regression-emergency-v1`  
**Run ID**: `20260528T224900Z-21407`  
**Agent**: Agent 2 / Worker

---

## Task

EMERGENCY fix. GPU compositing / zoom simplification changes broke overlays: labels and badges disappear during pan. Revert or fix the regression immediately. Restore stable canvas with visible overlays. Prove on `:5177`.

---

## 0. Bug Description

User reports: "Теперь при передвижении оверлеи пропадают"

Symptoms:
- During pan, overlays (labels, badges, property indicators) disappear.
- Shapes remain visible (unlike previous culling regression).
- Scrubber may or may not work.

Root cause (confirmed by Planner):
- CSS `will-change: transform` + `contain: layout paint style` + `transform: translateZ(0)` on `.djs-container` / `.djs-canvas` created a GPU compositing layer.
- bpmn-js overlays are positioned absolutely relative to the canvas coordinate system.
- When the container becomes a GPU layer, overlay positioning calculations break during pan.
- Zoom simplification CSS (`zoom-simplified`, `zoom-minimal`) is part of the same broken contour and must also be reverted.

---

## 1. What Must Be Reverted

### A. CSS — `frontend/src/styles/legacy/legacy_bpmn.css`
Remove ALL lines added by the gpu-compositing contour (lines 68–101 in current file):
- Block `/* ── GPU compositing for pan performance ── */` (lines 68–82)
- Block `/* ── Zoom simplification (< 0.4) ── */` (lines 84–90)
- Block `/* ── Zoom minimal (< 0.2) ── */` (lines 92–101)

Safe revert: `git checkout HEAD -- frontend/src/styles/legacy/legacy_bpmn.css`

### B. JS — `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
Remove GPU compositing hooks, KEEP overlay debounce hooks.

**REMOVE**:
- Constants `GPU_PAN_ACTIVE_CLASS`, `ZOOM_FULL_CLASS`, `ZOOM_SIMPLIFIED_CLASS`, `ZOOM_MINIMAL_CLASS`
- Function `updateZoomClass(canvasContainer, zoom)`
- Function `bindGpuCompositingAndZoomHooks({ eventBus, inst })`
- Calls to `bindGpuCompositingAndZoomHooks({ eventBus, inst })` inside `bindViewerStageEvents` and `bindModelerStageEvents`

**KEEP** (these are from stable `fix/canvas-overlay-debounce-v1`):
- `OVERLAY_PAN_DEBOUNCE_MS = 150`
- `debounce(fn, ms)` utility
- `bindOverlayPanDebouncer({ eventBus, inst })`
- Calls to `bindOverlayPanDebouncer({ eventBus, inst })` inside `bindViewerStageEvents` and `bindModelerStageEvents`
- `applyPropertiesOverlayDecorForZoomChangeDebounced`

### C. `deferUpdate: true` — KEEP
- `frontend/src/components/process/BpmnStage.jsx` (Viewer config)
- `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js` (Modeler config)

This is from the stable debounce contour. Do NOT remove.

---

## 2. Implementation Steps

1. **Diagnose** (2 min): Open `legacy_bpmn.css` and `wireBpmnStageRuntimeEvents.js`. Confirm the GPU compositing code exists.
2. **Revert CSS**: `git checkout HEAD -- frontend/src/styles/legacy/legacy_bpmn.css`
3. **Edit JS**: Surgically remove GPU compositing functions and calls. Keep overlay debouncer.
4. **Build**: `cd /opt/processmap-test/frontend && npm run build`
5. **Restart gateway**: `docker compose -p processmap_test restart gateway`
6. **Manual test on :5177** with large diagram.
7. **Verify** all acceptance criteria below pass.
8. **Commit**: `git add -A && git commit -m "revert(gpu-compositing): remove will-change/contain/zoom-simplification to fix overlay regression"`
9. **Write reports** (Russian language).

---

## 3. Verification Checklist (must pass ALL)

1. Load diagram on `:5177`.
2. All overlays visible initially.
3. Pan in all directions — overlays move WITH shapes, never disappear.
4. Pan fast — overlays may be briefly hidden by debounce (acceptable) but must not vanish permanently.
5. Stop pan — overlays snap to correct positions.
6. Zoom in/out — overlays scale correctly.
7. Scrubber works.
8. No console errors.

**FAIL if**:
- Any overlay disappears during pan.
- Overlays detach from shapes.
- Scrubber broken.

---

## 4. Deliverables (in Russian)

- `WORKER_REPORT.md` — what was done, files changed, build status
- `REGRESSION_CAUSE.md` — exact root cause
- `FIX_APPLIED.md` — revert details, what was removed vs kept
- `MANUAL_TEST_RESULTS.md` — checklist results with timestamps
- `RUNTIME_PROOF_5177.md` — curl/browser proof that :5177 serves correct bundles
- `WORKER_DONE` — empty marker file

If blocked: `EXEC_BLOCKED.md`.

---

## 5. Hard Rules

- Emergency priority: **stability > performance**.
- If unsure how to fix safely → REVERT the entire gpu-compositing/zoom-simplification change.
- Do NOT leave canvas in broken state.
- Do NOT introduce new CSS without testing overlay behavior.
- Preserve overlay-debounce changes (those were stable).
- Do NOT modify `node_modules/`.
- Do NOT touch backend.
- Do NOT merge, deploy, or open a PR.
