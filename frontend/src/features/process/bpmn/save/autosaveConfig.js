// Централизованный реестр констант автосохранения (contour canvas-save-pipeline-extraction-v1).
// Значения перенесены дословно из потребителей (MOVE, NOT REWRITE):
//   - coordinator:    bpmn/stage/wiring/bpmnWiring.js (createBpmnCoordinator options);
//   - mutationQueue:  hooks/useDiagramMutationLifecycle.js (useAutosaveQueue options);
//                     дефолт useAutosaveQueue.js (380) НЕ меняется;
//   - xmlPipeline:    save/saveBpmnState.js (saveCoordinator.registerPipeline "xml").
export const AUTOSAVE_CONFIG = Object.freeze({
  coordinator: {
    debounceMs: 10_000,
    dragThrottleMs: 5000,
    dragFinalDebounceMs: 500,
  },
  mutationQueue: {
    debounceMs: 350,
  },
  xmlPipeline: {
    debounceMs: 0,
    retryCount: 3,
    retryDelayMs: 1000,
    // Было 10_000: при просадке окружения (загруженная машина, медленная доставка
    // ответа) PUT /bpmn не успевал вернуться, клиент abort'ил запрос и откатывал
    // локальную правку — свойство «исчезало» через 10 с после сохранения.
    // Сервер сам обрабатывает тот же PUT за ~0.3 с. Abort оставлен как страховка
    // от реально зависшего транспорта, но с запасом на деградацию среды.
    transportTimeoutMs: 60_000,
    maxRetryDelayMs: 4000,
  },
});
