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
    transportTimeoutMs: 10_000,
    maxRetryDelayMs: 4000,
  },
});
