# Version Marker Relocation Proof

## Contour
fix/diagram-real-drag-performance-and-engine-decomposition-v1

## Before
- Canvas overlay badge at `top: 8, left: 8, zIndex: 101` inside `BpmnStage.jsx`
- Badge text: `a9a9d9c · 16.05.2026 · fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`
- Interfered with canvas viewport visually and conceptually

## After
- Badge **removed** from canvas overlay
- Footer `footerHint` in `AppShell.jsx` extended with contourId:
  `Версия v1.0.126 · a9a9d9c · 15.05.2026, 22:52 · fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- Fixed bottom-right badge still present as secondary (non-interfering, `pointerEvents: none`)

## Build Proof
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-15T22:52:40.008Z",
  "contourId": "fix/diagram-real-drag-performance-and-engine-decomposition-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

## Served Assets (fresh build)
- `assets/index-DtKts5bb.js` (hash changed from `index-3k3VEgia.js`)
- `assets/index-N6LiXuk7.css`

## Browser Verification
- `window.__PROCESSMAP_BUILD_INFO__` matches build-info.json exactly
- Footer version line visible in AppShell
- No top-left canvas badge found (`document.querySelector('.bpmnStack > div[style*="absolute"]')` returns null)

## Screenshots
- `version-marker-footer-proof.png` — footer with version line
- `version-marker-no-canvas-badge-proof.png` — full page showing no canvas badge
