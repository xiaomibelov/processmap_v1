# Runtime Before / After Comparison

## Test Conditions
- Same project/session: b1c8a56b6e / wewe
- Same overlays-off state
- Same Playwright real mouse drag: empty canvas, +300px X, +80px Y
- Measurement window includes drag + 500ms post-drag settle

## Metrics

| Metric | Before Fix | After Fix | Delta |
|--------|-----------|-----------|-------|
| Long tasks (count) | 34 | 20 | -41% |
| Long tasks (total ms) | ~6,244ms | ~2,848ms | -54% |
| Duration (total ms) | ~5,570ms | ~2,840ms | -49% |
| RAF count | 29 | 20 | -31%* |
| DOM delta | 0 | 0 | stable |
| SVG delta | 0 | 0 | stable |
| Console errors | 0 | 0 | stable |
| PUT `/bpmn` | 0 | 0 | safe |
| PATCH `/sessions` | 0 | 0 | safe |
| Viewport transform | changed | changed | functional |

*RAF count lower in after-fix because total duration is shorter. Per-second RAF rate is comparable.

## Smoothness Assessment
- **Before**: Noticeable frame drops during drag; Playwright step intervals averaged ~293ms when using `steps: 10`
- **After**: Fewer long tasks; drag completes faster; remaining lag is attributable to SVG coordinate updates

## Remaining Limitation
After suppressing all React-side overhead, ~20 long tasks (~2,850ms) remain. These are bpmn-js SVG viewport transform updates and cannot be eliminated without engine changes. Documented in `ENGINE_EVALUATION.md`.

## Network Safety
No PUT/PATCH from drag interactions in either before or after tests.
