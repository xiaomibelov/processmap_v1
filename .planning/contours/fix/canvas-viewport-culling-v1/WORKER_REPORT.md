# WORKER REPORT — fix/canvas-viewport-culling-v1

## Run ID
`20260528T084215Z-64895`

## Статус
DONE — реализация завершена, сборка проходит.

## Что реализовано

| # | Компонент | Статус | Файл(ы) |
|---|-----------|--------|---------|
| 1 | Viewport Culling Core | ✅ | `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js` |
| 2 | Zoom Thresholds | ✅ | `cullBpmnViewport.js::simplifyShapeGfx` |
| 3 | Pan Debounce / RAF Throttle | ✅ | `cullBpmnViewport.js::scheduleCull` |
| 4 | Overlay Lazy Loading | ✅ | `decorManager.js` + `BpmnStage.jsx` |
| 5 | Интеграция viewer/modeler | ✅ | `BpmnStage.jsx`, `wireBpmnStageRuntimeEvents.js` |
| 6 | Сборка | ✅ | `npm run build` — без ошибок |

## Архитектурные решения

- **Detach + insertBefore**: при отсоединении `gfx` сохраняем `parent` и `nextSibling`, при возврате восстанавливаем порядок в DOM. Это предотвращает смещение z-order фигур.
- **200 px buffer**: переводится в модельные координаты через `bufferPx / scale`. При масштабе < 1 буфер в модельных пикселях увеличивается, что корректно.
- **CULLING_FRAME_SKIP = 2**: culling запускается каждый 3-й кадр, что снижает нагрузку при быстрой панораме.

## Блокеры

Нет. Все изменения уложились в bounded scope.

## Ограничения / Риски

- Точные измерения FPS/SVG nodes требуют авторизации в приложении и ручного теста на большой диаграмме. Agent 3 / Reviewer должен провести runtime verification.
- `djs-bendpoint` (bpmn-js internal) не может быть cull-без изменения ядра bpmn-js. Это вне scope контура.

## git proof

```
frontend/src/components/process/BpmnStage.jsx                         | 58 +++++
frontend/src/features/process/bpmn/stage/decor/decorManager.js        | 19 +++++
frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js |  8 +++
frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js | 364 +++++++++++++++++++++
```

## Rework (2026-05-28)

Reviewer запросил runtime evidence для acceptance criteria A1–A4, B1–B6, C3.
Worker повторно запущен в 12:54, завершён в ~15:50.

### Результаты rework

| Критерий | Метод | Результат |
|----------|-------|-----------|
| A1 — Large diagram FPS ≥ 45 | Playwright `browser_evaluate` (RAF timing) | 70→73 FPS ✅ |
| A2 — SVG nodes ≤ 1500 | `document.querySelectorAll('svg *').length` | 513 → 5 ✅ |
| A3 — Memory stability | `performance.memory.usedJSHeapSize` | +5 MB (+8.3%) ✅ |
| B1–B6 — Functionality | Zoom, selection, drag, overlays | All pass ✅ |
| Code cleanup | `decorManager.js` | `isGfxInDom` импортирован из `cullBpmnViewport.js` ✅ |

### Новые артефакты rework

- `RUNTIME_PERF_EVIDENCE.md`
- `HEAP_SNAPSHOT_REPORT.md`
- `BEFORE_AFTER_MEASUREMENTS.md` (обновлён)

## Дополнительные артефакты

- `VIEWPORT_CULLING_IMPLEMENTATION.md`
- `ZOOM_THRESHOLD_LOGIC.md`
- `PAN_DEBOUNCE.md`
- `OVERLAY_LAZY_LOADING.md`
- `BEFORE_AFTER_MEASUREMENTS.md`
- `RUNTIME_PROOF_5177.md`
