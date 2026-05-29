# REGRESSION_CAUSE — fix/canvas-overlay-regression-emergency-v1

**Run ID**: `20260528T224900Z-21407`

---

## Symptom

Пользователь: **«Теперь при передвижении оверлеи пропадают»**.

- При pan оверлеи (labels, badges, property indicators) исчезают.
- Фигуры остаются видимыми.
- Скруббер может работать или нет.

## Root Cause

Контур `fix/canvas-gpu-compositing-zoom-simplification-v1` добавил:

1. **CSS GPU compositing** (`legacy_bpmn.css` строки 68–82):
   - `will-change: transform`
   - `transform: translateZ(0)`
   - `contain: layout paint style`
   - Класс `.pan-active` с `will-change: transform; contain: layout paint`

2. **CSS zoom simplification** (`legacy_bpmn.css` строки 84–101):
   - `.zoom-simplified` — скрывает иконки/маркеры при zoom < 0.4
   - `.zoom-minimal` — скрывает connection labels при zoom < 0.2

3. **JS GPU compositing hooks** (`wireBpmnStageRuntimeEvents.js`):
   - `bindGpuCompositingAndZoomHooks` — добавляет/убирает класс `pan-active` и zoom-классы через `eventBus`

## Why It Broke Overlays

bpmn-js overlay module позиционирует элементы **абсолютно** относительно canvas coordinate system.

Когда `.djs-container` / `.djs-canvas` становится GPU compositing layer (`will-change: transform` + `transform: translateZ(0)` + `contain`), браузер создаёт отдельный compositing layer. Это нарушает расчёт абсолютного позиционирования оверлеев во время pan — координатная система GPU-слоя отличается от ожидаемой bpmn-js, и оверлеи либо исчезают, либо отрываются от фигур.

## Decision

Emergency revert всего GPU-compositing / zoom-simplification контура. Сохранить стабильный debounce-контур (`fix/canvas-overlay-debounce-v1`, REVIEW_PASS).
