# Решение о следующем bottleneck — perf/process-stage-baseline-jank-v1

## Статус текущего контура

**React baseline jank в ProcessStage/AppShell устранён.**
- Idle: 0 long tasks (было ~74).
- Canvas pan drag: медиана 1 long task (было ~13–89).

## Оставшиеся bottleneck

### 1. SVG-bound cost в плотных областях диаграммы
- **Evidence**: stepped drag и element drag иногда дают выбросы (6–9 long tasks, max 500–700 мс) при перетаскивании через области с большим количеством SVG-элементов.
- **Attribution**: bpmn-js engine / браузерный SVG renderer.
- **Решение**: Вне scope текущего контура. Требует либо оптимизации bpmn-js rendering (simplification/layers), либо WebGL-замены canvas.

### 2. Tab switch Analysis ↔ Diagram
- **Evidence**: Переключение на вкладку «Анализ процессов» вызывает тяжёлые вычисления `useInterviewDerivedState` (40+ useMemo). Обратное переключение на Diagram мгновенное, т.к. BpmnStage остаётся смонтированным.
- **Attribution**: InterviewStage / useInterviewDerivedState.
- **Решение**: Отложить инициализацию Interview derived state до первого открытия Analysis tab; использовать `useTransition` для неблокирующего рендера.

### 3. Element drag + auto-save spike
- **Evidence**: PUT /bpmn после отпускания элемента вызывает 1–2 long tasks от обработки ответа и обновления состояния версий.
- **Attribution**: Pre-existing auto-save pipeline.
- **Решение**: Отложить auto-save на 500–1000 мс после окончания drag; батчить обновления версий.

## Рекомендация следующего контура

Если пользователь сообщит о продолжающемся lag:
1. **Первый приоритет**: `perf/interview-derived-state-lazy-init-v1` — отложенная инициализация analysis state.
2. **Второй приоритет**: `perf/bpmn-svg-density-optimization-v1` — оптимизация рендеринга плотных диаграмм (viewport culling, simplified shapes).
3. **Третий приоритет**: `perf/process-stage-shell-decomposition-v1` — полная декомпозиция ProcessStage на мелкие гранулярные компоненты.
