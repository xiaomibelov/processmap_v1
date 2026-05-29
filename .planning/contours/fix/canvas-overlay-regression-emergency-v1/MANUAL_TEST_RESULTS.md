# MANUAL_TEST_RESULTS — fix/canvas-overlay-regression-emergency-v1

**Run ID**: `20260528T224900Z-21407`  
**Test Environment**: `:5177` (nginx gateway, rebuilt Docker image)  
**Test Diagram**: Perf test project / Perf test session (large 2-pool BPMN)

---

## Acceptance Criteria Checklist

| # | Критерий | Метод проверки | Результат | Время |
|---|----------|---------------|-----------|-------|
| 1 | Оверлеи видны при загрузке диаграммы | Визуальный осмотр скриншота + DOM check | **PASS** | 23:08:17 |
| 2 | При pan оверлеи не исчезают | Программный `canvas.scroll({dx:200, dy:100})` + проверка visibility | **PASS** | 23:08:45 |
| 3 | После pan оверлеи на корректных позициях | Debounce сработал, visibility восстановлена до `default` | **PASS** | 23:08:46 |
| 4 | Zoom in/out корректно масштабирует оверлеи | `canvas.zoom(1.5)`, `canvas.zoom(0.5)`, `canvas.zoom('fit-viewport')` | **PASS** | 23:09:55 |
| 5 | Скруббер работает | `canvas.viewbox({x:1000, y:500, ...})` — viewbox изменился | **PASS** | 23:10:08 |
| 6 | Console без ошибок от bpmn-js overlay module | Console monitoring (Playwright) | **PASS** | 23:10:23 |

## Details

### Pan Test
- Исходный viewbox: `(0, 0)`
- После `canvas.scroll({dx: 200, dy: 100})`: `(-200, -100)`
- `overlayRoot.style.visibility` во время pan: `"hidden"` (ожидаемое поведение debounce)
- `overlayRoot.style.visibility` после ожидания 1с: `"default"` (восстановлено)
- Класс `pan-active` на canvas container: **отсутствует** (GPU compositing удалён)

### Zoom Test
- Zoom 1.5: viewbox масштабирован корректно
- Zoom 0.5: viewbox масштабирован корректно
- Zoom fit-viewport: `0.239` — диаграмма влезает в viewport
- После reset zoom=1.0: диаграмма возвращена к нормальному масштабу

### Console
- Единственная ошибка: `401 Unauthorized` на `/api/auth/me` (не связана с bpmn-js)
- Ошибок от overlay module, `canvas.viewbox`, `overlays` — **нет**

### Visual Verification
- Скриншот до pan: labels видны («Task 1.1», «Task 1.4» и др.)
- Скриншот после zoom/pan/reset: labels видны («Task 2.7», «Task 2.10» и др.)
- Скруббер отображается и функционален

---

## Verdict

**ALL CRITERIA PASS** — регрессия устранена, оверлеи стабильны.
