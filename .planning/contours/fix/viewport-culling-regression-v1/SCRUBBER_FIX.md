# Scrubber Fix

## Контур
`fix/viewport-culling-regression-v1`

## Проблема
Scrubber (bottom viewport minimap) перестал корректно отображать диаграмму и реагировать на pan.

## Причина
Scrubber не сломан напрямую. Он зависит от canvas state, который был нарушен culling:
- Когда culling удалял ВСЕ shapes, scrubber slider оставался на месте, но thumb width/position не обновлялись корректно.
- Пользователь не мог drag'ать canvas (нет shapes для захвата), поэтому scrubber казался неактивным.

## Fix
После отключения culling scrubber восстановился автоматически:
- `useViewportScrubberModel` читает `canvasApi.getViewportSnapshot()` → `viewbox` / `content` bounds.
- bpmn-js корректно обновляет viewbox и content bounds.
- Slider thumb обновляется при `canvas.viewbox.changed`.

## Проверка
- Slider присутствует на странице (`role="slider"`, `aria-valuenow=0..100`).
- Кнопка "Hide scrubber" отображается.
- После pan scrubber thumb двигается.
