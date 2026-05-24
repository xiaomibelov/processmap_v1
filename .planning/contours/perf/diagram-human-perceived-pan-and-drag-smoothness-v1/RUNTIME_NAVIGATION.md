# RUNTIME_NAVIGATION — perf/diagram-human-perceived-pan-and-drag-smoothness-v1

## Целевая диаграмма
- Проект: `wewe` / «Описание процессов Долгопрудный»
- Если прямой URL неизвестен, навигация:
  1. Открыть http://clearvestnic.ru:5180/?cb=<timestamp>
  2. Авторизоваться
  3. Выбрать проект `wewe`
  4. Открыть сессию «Описание процессов Долгопрудный»
  5. Перейти на вкладку «Диаграмма» (BPMN)
  6. Убедиться, что режим Modeler (палитра видна)
  7. Отключить оверлеи: в консоли `window.fpcPropertyOverlay = 0` или через UI «Слои OFF»

## Проверка версии (до и после)
- Footer должен показывать: `Версия v1.0.132 · <shaShort> · <date> · perf/diagram-human-perceived-pan-and-drag-smoothness-v1`
- `build-info.json` должен совпадать с HEAD
- `window.__PROCESSMAP_BUILD_INFO__` должен совпадать с `build-info.json`
- Маркер версии НЕ на canvas: `document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0`

## Сценарии измерений

### A. Пустая область canvas pan
- Начать с пустой области canvas (не на элементе, не на скраббере)
- Quick drag: 3 попытки
- Slow controlled drag: 3 попытки
- Записать: субъективная плавность, frame pacing, pointer-follow lag

### B. Плотная область canvas pan
- Перетащить через область с множеством BPMN-элементов
- Quick drag: 3 попытки
- Slow controlled drag: 3 попытки
- Записать: субъективная плавность, frame pacing, pointer-follow lag

### C. Element drag
- Выбрать видимый BPMN-элемент (Activity / Gateway / Event)
- Перетащить на ~100–200 px
- 3 попытки
- Записать: субъективная плавность, side effects (property panel, auto-save PUT)

### D. Диагональный drag
- Перетащить canvas по диагонали
- 3 попытки
- Записать: jitter, задержка

### E. Tab switch sanity
- Analysis → Diagram
- XML → Diagram
- Убедиться, что нет регрессии (нет remount, мгновенно)

## DOM / SVG counts (обязательно)
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length
window.__PROCESSMAP_BUILD_INFO__
```
