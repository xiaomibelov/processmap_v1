# FIX_APPLIED — fix/canvas-overlay-regression-emergency-v1

**Run ID**: `20260528T224900Z-21407`

---

## Removed

### A. CSS — `frontend/src/styles/legacy/legacy_bpmn.css`

Reverted to HEAD via `git checkout HEAD -- frontend/src/styles/legacy/legacy_bpmn.css`.

Удалены блоки:
- `/* ── GPU compositing for pan performance ── */` (строки 68–82)
  - `will-change: transform` на SVG
  - `transform: translateZ(0)` на SVG
  - `contain: layout paint style` на `.djs-container`
  - `.djs-canvas.pan-active` с `will-change` + `contain`
- `/* ── Zoom simplification (< 0.4) ── */` (строки 84–90)
- `/* ── Zoom minimal (< 0.2) ── */` (строки 92–101)

### B. JS — `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

Удалены:
- Константы: `GPU_PAN_ACTIVE_CLASS`, `ZOOM_FULL_CLASS`, `ZOOM_SIMPLIFIED_CLASS`, `ZOOM_MINIMAL_CLASS`
- Функция `updateZoomClass(canvasContainer, zoom)`
- Функция `bindGpuCompositingAndZoomHooks({ eventBus, inst })`
- Вызовы `bindGpuCompositingAndZoomHooks({ eventBus, inst })` в:
  - `bindViewerStageEvents`
  - `bindModelerStageEvents`

---

## Kept

### A. Overlay pan debounce (stable contour)

- `OVERLAY_PAN_DEBOUNCE_MS = 150`
- `debounce(fn, ms)` utility
- `bindOverlayPanDebouncer({ eventBus, inst })`
- Вызовы `bindOverlayPanDebouncer` в `bindViewerStageEvents` и `bindModelerStageEvents`

### B. Deferred overlay update (stable contour)

- `applyPropertiesOverlayDecorForZoomChangeDebounced` (debounced wrapper)
- `deferUpdate: true` в `BpmnStage.jsx` (Viewer config)
- `deferUpdate: true` в `bpmnWiring.js` (Modeler config)

---

## Verification

| Check | Result |
|-------|--------|
| CSS bundle不含 `will-change` / `pan-active` / `zoom-simplified` / `zoom-minimal` | PASS |
| JS file不含 `bindGpuCompositingAndZoomHooks` / `updateZoomClass` | PASS |
| JS file содержит `bindOverlayPanDebouncer` / `debounce` | PASS |
| `deferUpdate: true` preserved in configs | PASS |
