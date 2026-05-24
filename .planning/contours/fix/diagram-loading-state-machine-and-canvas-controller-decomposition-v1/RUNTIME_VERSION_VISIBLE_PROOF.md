# Runtime Version Visible Proof

## Build Info

```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-15T22:08:33.863Z",
  "contourId": "fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

## Verification

- `/build-info.json` on 5180 returns matching JSON ✅
- `window.__PROCESSMAP_BUILD_INFO__` in browser matches ✅
- `contourId` matches current contour ✅

## UI Evidence

Snapshot shows badge in top-left of canvas area:

```
Build: · a9a9d9c · 2026-05-15T22:08:33.863Z · fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
```

Simplified visible text:
```
a9a9d9c · 15.05.2026 · fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
```

## Screenshot

`runtime-diagram-tab-active.png` captured showing:
- Diagram tab selected
- BPMN canvas rendered
- Version badge visible at top-left of canvas area

## Placement

Badge is rendered inside `.bpmnStack` at `position: absolute; top: 8px; left: 8px; z-index: 101`.
This ensures it is visible above the canvas and during loading.
