# Version Update Ledger Proof

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

## Changes
1. `frontend/src/config/appVersion.js`:
   - `currentVersion`: `"v1.0.127"` → `"v1.0.128"`
   - Added changelog entry at index 0 with 4 Russian change lines about drag hot path optimization.

2. `scripts/generate-build-info.mjs`:
   - Fallback `contourId` updated to `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`.

## Build Evidence
- Build completed with 0 errors (28.35s).
- Gateway restarted (`docker restart processmap_test-gateway-1`).

## Runtime Verification
- `curl http://clearvestnic.ru:5180/build-info.json` returns:
  ```json
  {
    "branch": "fix/lockfile-sync-test",
    "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
    "shaShort": "a9a9d9c",
    "timestamp": "2026-05-16T08:13:20.955Z",
    "contourId": "perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1",
    "dirty": true,
    "host": "clearvestnic.ru"
  }
  ```
- Footer shows: `Версия v1.0.128 · a9a9d9c · 16.05.2026, 08:13 · perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1 · Оптимизирован hot path drag диаграммы...`
- JS asset hash changed from `index-BUNGB6M-.js` to `index-DLfGhA-E.js`.
- Marker NOT on canvas: `document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0`.

## Status
✅ Version ledger updated and verified.
