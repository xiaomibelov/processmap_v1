# Performance Targets

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`

---

## Baseline (after overlay-debounce contour)

| Metric | Value | Source |
|--------|-------|--------|
| Large diagram pan FPS | ~30–50 | `fix/canvas-overlay-debounce-v1/BEFORE_AFTER_MEASUREMENTS.md` |
| Perceived lag | Present | User report: «Лаги не убрались» |
| SVG nodes (428 elements) | 3754 | `audit/canvas-performance-diagnosis-v1` |
| Small diagram pan FPS | 60 | Baseline |

## Target (after GPU compositing + zoom simplification)

| Metric | Target | Verdict |
|--------|--------|---------|
| Large diagram pan FPS | **≥ 55** | PASS required |
| Perceived lag | **Eliminated** (fluid like Google Maps) | PASS required |
| Small diagram pan FPS | **60** (no regression) | PASS required |
| Paint time during pan | **Reduced ≥ 50%** | PASS required |
| DevTools Layers | `.djs-container` on compositor layer | PASS required |

## Measurement Methodology

1. **FPS measurement**: `measureFPS()` during 3-second continuous pan, same diagram (108 KB XML, 428 elements).
2. **DevTools Performance**: Record 3-second pan, extract total "Paint" time.
3. **DevTools Layers**: Screenshot layer tree during pan.
4. **Perceived lag**: Real mouse drag test — pan should feel "sticky" or "fluid", not stuttery.
5. **Small diagram**: Same test on ≤10 elements diagram.

## Tools
- Chrome DevTools Performance panel
- Chrome DevTools Layers panel
- Chrome FPS meter (Rendering → FPS Meter)
- Playwright headless (if used): note headless caps at ~50 FPS; headed Chrome required for ≥55 verification.
