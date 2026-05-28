# Реализация Viewport Culling

## Цель
Сократить количество отрисовываемых SVG-узлов при панорамировании больших диаграмм за счёт удаления из DOM групп `gfx` элементов, находящихся за пределами видимой области.

## Файлы

| Файл | Роль |
|------|------|
| `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js` | Новый модуль: математика пересечений, detach/reattach, упрощение zoom |
| `frontend/src/components/process/BpmnStage.jsx` | Интеграция culler-ов для viewer и modeler |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Привязка `scheduleCull()` к событию `canvas.viewbox.changed` |

## Алгоритм

1. **Вычисление viewport** (модельные координаты):
   ```js
   const vb = canvas.viewbox();
   const bufferModel = BUFFER_PX / Math.max(vb.scale, 0.001);
   left   = vb.x - bufferModel;
   top    = vb.y - bufferModel;
   right  = vb.x + vb.width + bufferModel;
   bottom = vb.y + vb.height + bufferModel;
   ```
2. **Bounds элемента**:
   - Фигуры: `{ x, y, width, height }` из `elementRegistry`
   - Связи: min/max по `waypoints`
3. **Пересечение AABB**:
   ```js
   !(bounds.x + bounds.width < left || bounds.x > right || ...)
   ```
4. **Скрытие**: `gfx.remove()` + сохранение `parent` и `nextSibling` для восстановления порядка в DOM.
5. **Показ**: `parent.insertBefore(gfx, nextSibling)` — сохраняет z-order SVG.

## Решения

- **Buffer = 200 px** (экранные координаты) — предотвращает мерцание при быстрой панораме.
- **Detach вместо `display:none`** — audit требует физического снижения SVG node count. `display:none` оставляет узлы в DOM.
- **Сохранение `nextSibling`** — при re-attach восстанавливаем исходный порядок элементов в слое, чтобы не нарушать z-index.

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Detach ломает event handling bpmn-js | Сохраняем `gfx` в памяти; bpmn-js хранит ссылки. При re-attach события работают. Fallback: `display:none` через опцию `useDetach:false` |
| Порядок DOM меняется | Сохраняем `nextSibling` и `parent` |
