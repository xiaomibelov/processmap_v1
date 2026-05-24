# RUNTIME_BEFORE_AFTER

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`

---

## Before (v1.0.131)

- URL: `http://clearvestnic.ru:5180/?cb=<timestamp>`
- HTTP 200 OK
- `build-info.json`: `v1.0.131`, contourId `perf/process-stage-baseline-jank-v1`
- Footer: **Версия v1.0.131**
- `.djs-viewport` filter: `brightness(0.88) contrast(0.96)` (persistent)
- `.fpcDiagramInteracting`: отсутствовал

## After (v1.0.132)

- URL: `http://clearvestnic.ru:5180/?cb=1778969700`
- HTTP 200 OK
- `build-info.json`: `v1.0.132`, contourId `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`
- Footer: **Версия v1.0.132**
- `.djs-viewport` filter: `brightness(0.88) contrast(0.96)` → **none во время interaction**
- `.fpcDiagramInteracting`: toggles на `.djs-container` при pan/drag
- `applyPropertiesOverlayDecorForZoomChange`: **suppressed during pan/drag**

## Screenshot proof

- `baseline_diagram_fit.png` — до кода (v1.0.131)
- Runtime proof после кода подтверждён через browser evaluate:
  - `before.filter = brightness(0.88) contrast(0.96)`
  - `during.filter = none`
  - `after.filter = brightness(0.88) contrast(0.96)`
