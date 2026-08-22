# ZOOM_SIMPLIFICATION.md

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`

---

## Цель
Снизить количество отрисовываемых SVG-узлов при мелком zoom (20–40%), где детали всё равно невидимы.

## Реализация

### 1. CSS-классы на контейнере

```css
/* zoom-simplified: zoom < 0.4 */
.bpmnStage .djs-container.zoom-simplified .djs-shape .djs-visual > image,
.bpmnStage .djs-container.zoom-simplified .djs-shape > .djs-visual > :not(rect):not(text):not(tspan) {
  display: none;
}

/* zoom-minimal: zoom < 0.2 */
.bpmnStage .djs-container.zoom-minimal .djs-shape .djs-visual > image,
.bpmnStage .djs-container.zoom-minimal .djs-shape > .djs-visual > :not(rect):not(text):not(tspan) {
  display: none;
}

.bpmnStage .djs-container.zoom-minimal .djs-connection .djs-label {
  display: none;
}
```

### 2. JS-логика переключения

Функция `updateZoomClass(canvasContainer, zoom)`:

| Zoom | Класс | Эффект |
|------|-------|--------|
| ≥ 0.4 | `zoom-full` | Полный рендеринг |
| 0.2 – 0.4 | `zoom-simplified` | Скрыты иконки, маркеры, decorative paths |
| < 0.2 | `zoom-minimal` | Всё вышеперечисленное + скрыты метки связей |

Вызывается:
- При `canvas.viewbox.changed`
- При инициализации диаграммы

### 3. Почему сохраняется hit-testing

- `display: none` применяется только к **дочерним** элементам внутри `.djs-visual`
- Корневой `.djs-shape` остаётся видимым
- `rect` и `text` / `tspan` исключены из селектора (`:not(rect):not(text):not(tspan)`)
- Click, hover, selection, context menu продолжают работать на уровне фигуры

## Что НЕ реализовано

**Connection line simplification** (прямые линии при zoom < 0.3):
- Не нашлось CSS-решения для замены routed orthogonal paths на прямые линии
- Renderer hook потребовал бы модификации ядра bpmn-js или кастомного renderer
- Отложено как out-of-scope для этого контура (средний риск, средний эффект)

## Файлы

- `frontend/src/styles/legacy/legacy_bpmn.css` (строки 84–101)
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` (строки 21–35, 59–64, 68–73)
