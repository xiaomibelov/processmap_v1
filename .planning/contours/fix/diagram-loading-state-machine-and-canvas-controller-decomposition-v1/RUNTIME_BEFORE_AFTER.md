# Runtime Before / After — fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

## Before Fix (clearvestnic.ru:5180, build a9a9d9c @ 21:26)

| Metric | Value |
|--------|-------|
| `bodyHasLoading` | `true` ("Загрузка диаграммы…" visible) |
| `.djs-container` count | 0 |
| `svg` count | ~18 (icons only) |
| `.diagramSkeleton` count | 1 |
| `window.__PM_DIAGRAM_RUNTIME__` | N/A (not present) |
| `buildInfo.contourId` | `fix/diagram-visible-version-and-large-canvas-lag-v1` (stale) |
| Version badge visible | No (only footer/bottom badge) |
| Diagram usable | No |

## After Fix (clearvestnic.ru:5180, build a9a9d9c @ 22:08)

| Metric | Value |
|--------|-------|
| `bodyHasLoading` | `false` |
| `.djs-container` count | 1 |
| `svg` count | 32 |
| `.diagramSkeleton` count | 0 |
| `window.__PM_DIAGRAM_RUNTIME__.loadState` | `"ready"` |
| `window.__PM_DIAGRAM_RUNTIME__.viewerReady` | `true` |
| `buildInfo.contourId` | `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1` |
| Version badge visible | Yes (top-left of canvas area) |
| Diagram usable | Yes |
| Zoom | Works (scale 1.0 → 1.2 confirmed) |
| `.djs-bendpoint` count | 0 |
| `.djs-segment-dragger` count | 0 |
| `.djs-palette` count | 0 |
| Tab switch Analysis → Diagram | Stable, `.djs-container` stays at 1 |
| Tab switch XML → Diagram | Stable |
| Network PUT `/bpmn` | 0 |
| Network PATCH `/sessions` | 0 |

## Timings

| Scenario | Before | After |
|----------|--------|-------|
| Cold open Diagram tab | ∞ (stuck) | ~5s to ready |
| Warm tab switch | ∞ (stuck) | ~2s to ready |
| Build time | 29.18s | 29.17s |
