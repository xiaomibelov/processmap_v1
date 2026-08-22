# REWORK REQUEST — fix/canvas-viewport-culling-v1

## Run ID
`20260528T084215Z-64895`

## Причина
Reviewer не смог независимо подтвердить критические acceptance criteria из-за сложности UI-навигации (Workspace Explorer → project → session). Требуется дополнительное доказательство от Worker.

## Что нужно предоставить

### 1. Performance evidence (обязательно)

Записать короткое видео или предоставить скриншоты Chrome DevTools:

**Large diagram (session `5425e68a8d`, 428 элементов):**
- [ ] FPS meter during 3-second continuous pan (3 trials, median ≥ 45)
- [ ] `document.querySelectorAll('svg *').length` during pan (≤ 1500)
- [ ] Performance flame chart: sum of tasks > 50 ms during 3-second pan (≤ 50 ms)

**Small diagram (session `6318dcf810`, 9 элементов):**
- [ ] FPS meter during pan (= 60, no regression)

### 2. Functionality evidence (обязательно)

Короткое видео или пошаговые скриншоты:
- [ ] Zoom to 0.1, 0.3, 0.5, 1.0, 2.0 — canvas renders without errors
- [ ] Click visible shape → selection highlight appears
- [ ] Click visible connection → selection highlight appears
- [ ] Drag task shape → shape moves, connections update
- [ ] Property overlay badges appear when element is visible
- [ ] Connection crossing viewport renders correctly (not clipped to point)
- [ ] Selection handles appear for visible selected elements

### 3. Memory check (обязательно)

- [ ] Chrome DevTools Memory tab: heap snapshot baseline
- [ ] 5 pan cycles + 10 seconds wait
- [ ] Second heap snapshot: must recover to baseline ±10%

### 4. Code cleanup (желательно)

- [ ] Убрать дублирование `isElementGfxInDom` — импортировать `isGfxInDom` из `cullBpmnViewport.js` в `decorManager.js`

## Как предоставить

Добавьте артефакты в `.planning/contours/fix/canvas-viewport-culling-v1/`:
- `RUNTIME_PERF_EVIDENCE.md` — описание + ссылки на скриншоты/видео
- `HEAP_SNAPSHOT_REPORT.md` — результаты памяти
- Обновите `BEFORE_AFTER_MEASUREMENTS.md` своими измерениями (не скопируйте из PLAN)

## Deadline

По готовности — re-request review.
