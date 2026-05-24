# Карта источников React-рендера — perf/process-stage-baseline-jank-v1

## God-файлы и их роль в рендер-цепочке

### 1. ProcessStage.jsx (6880 строк)
- **Роль**: Корневой оркестратор сессии. Получает ~25 пропсов от AppShell.
- **Проблема**: Каждый setState в родителях (AppShell, useSessionShellOrchestration) вызывал полный перерендер ProcessStage и всего его поддерева.
- **Фикс**: `export default memo(ProcessStage)` — подавляет перерендер при неизменных пропсах.

### 2. BpmnStage.jsx (5813 строк)
- **Роль**: Обёртка bpmn-js Modeler/Viewer. 20+ useEffect, адаптеры событий.
- **Проблема**: Нестабильные объектные пропсы (callbacks, конфигурации) приходили от ProcessStage, вызывая перерендер даже при идентичном состоянии диаграммы.
- **Фикс**: `export default memo(BpmnStage)` — граница memo на уровне диаграммы.

### 3. InterviewStage.jsx
- **Роль**: Поверхность анализа процесса. Тяжёлые useMemo вычисления.
- **Проблема**: Перерендер при любом изменении sessionDraft, даже если interview-часть не изменилась.
- **Фикс**: `export default memo(InterviewStage)`.

### 4. ProcessStageDiagramControls.jsx (1700+ строк)
- **Роль**: Toolbar действий диаграммы.
- **Проблема**: Перерендер при каждом изменении `view` объекта сверху.
- **Фикс**: `memo(ProcessStageDiagramControls, areViewsEqual)` с shallow comparison по `view`.

## Хуки с нестабильными зависимостями

### useStableProcessDiagramOverlayLayersProps.js
- **Фикс**: Добавлен `useStableDraft(inputRaw?.draft)` — предотвращает перерендер при идентичном содержимом draft, когда ссылка объекта меняется из-за иммутабельных обновлений родителя.

## Polling-источники setState

| Источник | Было | Стало | Эффект |
|----------|------|-------|--------|
| useBpmnViewportSource (fallback timer) | 360 мс | 5000 мс | Реже пересчёт viewport |
| useBpmnCanvasController (sync interval) | 900 мс | 5000 мс | Реже синхронизация canvas |
| ProcessStage (undo/redo visible poll) | 2000 мс | 5000 мс | Реже обновление toolbar |
| ProcessStage (remote session sync) | 9000 мс | 15000 мс | Реже опрос версий |

## Attribution (какой модуль доминировал в profiler)

До оптимизации:
- React bundle занимал ~95% CPU во время drag (по данным предыдущих контуров).
- bpmn-js engine ~0.5% CPU.

После оптимизации:
- Idle: 0 long tasks — React baseline jank устранён.
- Drag: оставшиеся long tasks связаны с SVG-рендерингом bpmn-js при попадании в плотные области диаграммы, а не с React.
