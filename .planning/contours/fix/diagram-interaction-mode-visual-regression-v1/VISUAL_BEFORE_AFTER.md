# VISUAL_BEFORE_AFTER — fix/diagram-interaction-mode-visual-regression-v1

**Run ID:** 20260516T224839Z-35866
**Статус:** Before captured, After pending build (Part 2)

---

## Before (текущий runtime v1.0.132)

Скриншоты в `screenshots/`:
- `07-overlays-off.png` — задачи на тёмном canvas выглядят серыми
- Computed fill: `color(srgb 0.0588 0.0863 0.1490 / 0.1443)`
- Computed viewport filter: `brightness(0.88) contrast(0.96)`

## After (после сборки Part 2)

- Task fill: `color(srgb 1 1 1 / 0.847843)` — белый ✅
- Viewport filter: `none` — отсутствует ✅
- Во время pan — отсутствие белого flash (filter не переключается) ✅

### After скриншоты

- `screenshots/08-after-fix-diagram-tasks.png` — задачи с белым fill
- `screenshots/09-after-fix-zoomed-tasks.png` — zoom на задачи
- `screenshots/10-session-diagram-opened.png` — открытая сессия

### Computed styles during real pan

| State | `fpcDiagramInteracting` | `viewport filter` | `task fill` |
|-------|------------------------|-------------------|-------------|
| Before drag | `false` | `none` | `color(srgb 1 1 1 / 0.847843)` |
| During drag | `true` | `none` | `color(srgb 1 1 1 / 0.847843)` |
| After pointerup | `false` | `none` | `color(srgb 1 1 1 / 0.847843)` |

---

## Чек-лист для Part 2

- [x] Пересобрать frontend
- [x] Открыть свежий 5180
- [x] Сделать after-скриншоты
- [x] Сравнить computed styles before/after
- [x] Проверить отсутствие flash при pan
