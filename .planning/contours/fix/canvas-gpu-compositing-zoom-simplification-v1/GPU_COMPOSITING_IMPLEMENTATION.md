# GPU_COMPOSITING_IMPLEMENTATION.md

**Контур**: `fix/canvas-gpu-compositing-zoom-simplification-v1`

---

## Цель
Заставить браузер использовать GPU-слой для SVG-холста во время pan, устраняя CPU paint/composite стоимость 3754 SVG-узлов.

## Реализация

### 1. CSS (legacy_bpmn.css)

```css
/* Постоянное GPU-ускорение SVG */
.bpmnStage .djs-container svg,
.bpmnStage .djs-canvas svg {
  will-change: transform;
  transform: translateZ(0);
}

/* CSS containment для изоляции перерисовки */
.bpmnStage .djs-container {
  contain: layout paint style;
}

/* Усиление containment во время активного pan */
.bpmnStage .djs-canvas.pan-active {
  will-change: transform;
  contain: layout paint;
}
```

### 2. JS Hooks (wireBpmnStageRuntimeEvents.js)

Функция `bindGpuCompositingAndZoomHooks({ eventBus, inst })`:

- Получает `canvas._container` — DOM-узел bpmn-js
- Находит `.djs-canvas` внутри контейнера (fallback — сам контейнер)
- Подписывается на `canvas.viewbox.changing` (приоритет 1250):
  - Добавляет класс `pan-active`
  - Сбрасывает таймаут снятия класса
- Подписывается на `canvas.viewbox.changed` (приоритет 1250):
  - Запускает таймаут 100 мс на снятие `pan-active`
  - Обновляет zoom-класс
- При инициализации устанавливает начальный zoom-класс

### 3. deferUpdate

Добавлено `deferUpdate: true` в конфигурацию Viewer и Modeler:
- `BpmnStage.jsx`: строка 4479
- `bpmnWiring.js`: строка 251

Это откладывает обновления DOM в bpmn-js до следующего animation frame, снижая синхронную нагрузку на main thread.

## Почему это работает

- `transform: translateZ(0)` принудительно создаёт compositor layer для SVG
- `will-change: transform` сигнализирует браузеру заранее подготовить layer
- `contain: layout paint` изолирует область перерисовки — браузер не пересчитывает layout за пределами холста
- При pan viewbox меняется через CSS transform, а не через полный repaint 3754 узлов

## Файлы

- `frontend/src/styles/legacy/legacy_bpmn.css` (строки 68–82)
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` (строки 12–74)
- `frontend/src/components/process/BpmnStage.jsx` (строка 4479)
- `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js` (строка 251)
