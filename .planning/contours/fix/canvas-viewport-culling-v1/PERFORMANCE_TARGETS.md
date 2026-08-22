# Performance Targets

## Baseline (from audit)

| Metric | Small Diagram | Large Diagram |
|--------|---------------|---------------|
| Elements | 9 | 428 |
| FPS at rest | 60.4 | 60.5 |
| FPS during pan | 60 | **~30** |
| DOM nodes | 482 | 4145 |
| SVG nodes | 100 | 3754 |
| Long tasks (pan) | 0 ms | 148 ms (83 + 65) |
| Backend TTFB | 27 ms | 363 ms |

## Targets After Fix

| Metric | Target | Measurement Tool |
|--------|--------|------------------|
| Large diagram FPS during pan | **≥ 45** | Chrome DevTools FPS meter |
| SVG nodes during pan (large) | **≤ 1500** | `document.querySelectorAll('svg *').length` |
| Long tasks during pan (large) | **≤ 50 ms** | Chrome DevTools Performance flame chart |
| Small diagram FPS (all states) | **60** | Chrome DevTools FPS meter |
| Small diagram SVG nodes | ≤ 100 | `document.querySelectorAll('svg *').length` |

## Measurement Methodology

Reuse `audit/canvas-performance-diagnosis-v1` methodology:
1. Load small diagram (session `6318dcf810`) → record baseline.
2. Load large diagram (session `5425e68a8d`) → record baseline.
3. Open Chrome DevTools Performance tab.
4. Start 3-second recording.
5. Perform continuous pan (drag canvas left-right for 3 seconds).
6. Stop recording.
7. Extract:
   - FPS (from frame strip)
   - Long tasks (from flame chart, tasks > 50 ms)
   - Total scripting time
8. Record DOM/SVG counts via console:
   - `document.querySelectorAll('*').length`
   - `document.querySelectorAll('svg *').length`
   - `document.querySelectorAll('.djs-shape').length`
   - `document.querySelectorAll('.djs-connection').length`

## Regression Guard
- Small diagram must remain at 60 FPS.
- No new console errors.
- No memory leaks (heap recovers to baseline after 10 s wait).
