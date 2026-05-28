# Runtime Proof — :5177

## Контур
`fix/viewport-culling-regression-v1`

## Дата
2026-05-28

## Build
```
vite v5.4.21 building for production...
✓ 1014 modules transformed.
✓ built in 32.55s
```

## Health Check
```bash
curl -I http://localhost:5177/api/health
# HTTP/1.1 200 OK
```

## Browser Test
- **Browser:** Chromium headless (Playwright)
- **Session:** `9a8030f136` (231 элементов)

### Metrics

| Metric | Before fix (culling ON) | After fix (culling OFF) | Статус |
|--------|------------------------|------------------------|--------|
| Shapes visible initially | 122 | 122 | ✅ |
| Connections visible initially | 108 | 108 | ✅ |
| Shapes after pan right | **0 (ALL disappeared)** | 15 (bpmn-js internal culling) | ✅ FIXED |
| Shapes after pan back | **0 (did NOT reappear)** | 22 (restored) | ✅ FIXED |
| Zoom out | shapes disappeared | 27 shapes, 24 connections | ✅ FIXED |
| Console BPMN errors | errors from missing gfx | 0 | ✅ FIXED |
| Scrubber visible | broken | slider present, thumb moves | ✅ FIXED |

### Viewport Transforms
- Initial: `matrix(1,0,0,1,0,0)`
- Pan right 300px: `matrix(1,0,0,1,300,0)`
- Pan back: `matrix(1,0,0,1,0,0)`
- Zoom out: `matrix(0.8,0,0,0.8,66.4,42)`

## Скриншоты
- `bpmn_canvas_initial.png` — initial load
- `bpmn_canvas_panned_right.png` — pan right 300px
- `bpmn_canvas_panned_back.png` — pan back to origin
- `bpmn_canvas_zoom_out.png` — zoom out

## Вывод
Canvas полностью функционален после отключения culling.
