# Large Canvas Baseline

## Test Session
- **Project**: `b1c8a56b6e` (`Описание процессов Долгопрудный`)
- **Session**: `4c515d1c6e` (`wewe`)
- **Overlays**: OFF (`.fpcPropertyOverlay = 0` confirmed)
- **Test time**: 2026-05-15T20:47Z (before code changes)

## DOM Metrics
| Metric | Value |
|--------|-------|
| `document.querySelectorAll('*').length` | 8,026 |
| `document.querySelectorAll('svg *').length` | 2,392 |
| `.djs-container` count | 1 |
| `.djs-palette` visible | true |
| `.djs-bendpoint` count | 0 (no connection selected) |
| `.djs-segment-dragger` count | 0 |
| `.fpcPropertyOverlay` count | 0 |
| `.djs-overlay` count | ~17 |

## Pan / Zoom
- Baseline pan/zoom average: ~4 ms/cycle (prior audit figure)

## Tab Switch
- Analysis → Diagram → XML → Diagram: ~19 s elapsed for XML→Diagram return

## Key Observation
Modeler was active even in pure view mode (palette visible, 2392 SVG elements). This confirmed H3: default view path used Modeler, not Viewer.
