# IMPLEMENTATION_NOTES

**Contour:** `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`

---

## Изменённые файлы

### 1. `frontend/src/features/process/bpmn/stage/interaction/diagramInteractionMode.js` (новый)

- Экспортирует `bindDiagramInteractionMode({ canvasContainer, eventBus })`.
- Переключает класс `fpcDiagramInteracting` на `canvasContainer`.
- Порог 5px (`MOVE_THRESHOLD_PX`).
- Очищает слушатели на `canvas.destroy`.

### 2. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

- Импорт `bindDiagramInteractionMode`, `isCanvasPanningActive`, `shouldSuppressSideEffectsDuringDrag`.
- В `bindViewerStageEvents` и `bindModelerStageEvents`:
  - Вызов `bindDiagramInteractionMode` для своего canvas container.
  - Guard `applyPropertiesOverlayDecorForZoomChange` в `canvas.viewbox.changed`.

### 3. `frontend/src/styles/legacy/legacy_bpmn.css`

- Добавлено правило viewport filter (base + interaction override).

### 4. `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`

- Добавлено `shape-rendering: crispEdges !important` для `.fpcDiagramInteracting .djs-visual *`.

### 5. `frontend/src/config/appVersion.js`

- Bumped to `v1.0.132`.

---

## Не изменено

- `backend/app/` — не трогалось.
- `BpmnStage.jsx` — не изменялся напрямую; изменения через существующие extracted модули.
- Product Actions, AG-UI, RAG tooling — не затронуты.
- BPMN XML semantics — не изменены.

---

## Build notes

- Локальный `npm run build` OOM-kill на хосте (3.8 GB RAM).
- Сборка выполнена успешно внутри `processmap_test-frontend-1` (Docker).
- После сборки CSS в `dist/assets/index-B7rPaHle.css` потребовал manual patch specificity (`.djs-container.fpcDiagramInteracting .viewport`).
- Исходный `legacy_bpmn.css` обновлён корректно; при следующей чистой сборке manual patch не нужен.
