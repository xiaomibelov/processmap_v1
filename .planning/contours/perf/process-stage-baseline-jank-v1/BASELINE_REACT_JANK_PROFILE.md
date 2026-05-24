# Базовый профиль React jank — perf/process-stage-baseline-jank-v1

## Методология

- **Браузер**: Playwright Chromium (headless, fresh context)
- **Viewport**: 1400×900
- **Целевая диаграмма**: wewe / «Описание процессов Долгопрудный»
- **Overlays**: OFF (`window.fpcPropertyOverlay = 0`)
- **Измерение**: PerformanceObserver (`entryTypes: ['longtask']`)

## До оптимизации (v1.0.129)

| Сценарий | Long tasks | Общее время, мс | Макс, мс | Источник |
|----------|-----------|-----------------|----------|----------|
| Idle 10 с | ~74 | ~10 272 | — | `baseline_idle_10s_before.json` |
| Quick drag (медиана 3 попыток) | ~13 | ~1 738 | — | REVIEW_REPORT.md |
| Stepped drag (медиана 3 попыток) | ~89 | ~12 515 | — | REVIEW_REPORT.md |
| Element drag (медиана 3 попыток) | ~41 | ~5 839 | — | REVIEW_REPORT.md |

## После оптимизации (v1.0.131, текущий билд)

| Сценарий | Long tasks | Общее время, мс | Макс, мс | Примечание |
|----------|-----------|-----------------|----------|------------|
| Idle 10 с | **0** | **0** | **0** | Полное отсутствие baseline jank |
| Quick drag (попытка 1) | 1 | 56 | 56 | |
| Quick drag (попытка 2) | 1 | 50 | 50 | |
| Quick drag (попытка 3) | 6 | 1 610 | 574 | Выброс при попадании в плотную область диаграммы |
| **Quick drag (медиана)** | **1** | **56** | **56** | |
| Stepped drag (попытка 1) | 1 | 68 | 68 | |
| Stepped drag (попытка 2) | 1 | 61 | 61 | |
| Stepped drag (попытка 3) | 9 | 2 750 | 552 | Выброс при попадании в плотную область |
| **Stepped drag (медиана)** | **1** | **68** | **68** | |
| Element drag (попытка 1, Activity) | 6 | 1 792 | 486 | PUT /bpmn после отпускания (pre-existing auto-save) |
| Element drag (попытка 2, Gateway) | 2 | 287 | 156 | Без PUT |
| Element drag (попытка 3, Activity) | 7 | 1 972 | 702 | PUT /bpmn после отпускания |
| **Element drag (медиана)** | **6** | **1 792** | **486** | |
| XML ↔ Diagram | 0 | 0 | 0 | Диаграмма остаётся смонтированной в DOM, переключение мгновенное |

## Выводы

1. **Baseline jank устранён**: idle 10 с даёт 0 long tasks (было ~74).
2. **Canvas pan улучшен**: медиана quick drag снижена с ~13 до 1 long task.
3. **Stepped drag улучшен**: медиана снижена с ~89 до 1 long task.
4. **Element drag**: варьируется от 2 до 7 long tasks в зависимости от элемента и наличия auto-save. Чистые попытки (без PUT) показывают ~2 long tasks.
5. **Tab switch XML↔Diagram**: мгновенный, т.к. BpmnStage остаётся смонтированным.
