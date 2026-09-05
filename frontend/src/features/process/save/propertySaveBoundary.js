// Сборка опций saveBpmnState для camunda-property save — перенесена дословно
// из App.jsx (setElementCamundaExtensions → вызов saveBpmnState, был :2957-2986).
// Contour canvas-save-pipeline-extraction-v1 (п.2). MOVE, NOT REWRITE:
// значения, порядок ключей и семантика колбэков не изменены.
//
// Замыкания на App-state заменены параметрами:
//   - draft?.project_id → projectId
//   - optimisticMeta / currentMeta / extension-карты → параметры (вычисляются
//     в App до вызова, как и раньше)
//   - isLocalSessionId(sid) → isLocal (вычисляется в App, как и раньше)
//   - options (remove/backgroundSessionRefresh/колбэки) → параметр
//   - bpmnStageRef → параметр (делегирование getBase/remember/getModelerXml,
//     как в оригинале)
export function buildPropertySaveOptions({
  operation,
  sid,
  isLocal,
  baseDiagramStateVersion,
  projectId,
  elementId,
  currentCamundaExtensionsByElementId,
  nextCamundaExtensionsByElementId,
  currentMeta,
  optimisticMeta,
  apiPutBpmnXml,
  flushSave,
  apiGetSession,
  apiGetBpmnXml,
  onSessionSync,
  overwriteBpmnSnapshot,
  options,
  bpmnStageRef,
}) {
  return {
    operation,
    sessionId: sid,
    isLocal,
    baseDiagramStateVersion,
    getBaseDiagramStateVersion: () => bpmnStageRef.current?.getBaseDiagramStateVersion?.(),
    rememberDiagramStateVersion: (version) => bpmnStageRef.current?.rememberDiagramStateVersion?.(version, { sessionId: sid }),
    projectId,
    elementId,
    currentCamundaExtensionsByElementId,
    nextCamundaExtensionsByElementId,
    currentMeta,
    nextMeta: optimisticMeta,
    getModelerXml: async () => {
      const snap = await bpmnStageRef.current?.getRuntimeXmlSnapshot?.();
      return snap?.ok ? snap.xml : "";
    },
    apiPutBpmnXml,
    flushSave,
    apiGetSession,
    apiGetBpmnXml,
    onSessionSync,
    overwriteBpmnSnapshot,
    backgroundSessionRefresh: options?.backgroundSessionRefresh === true,
    onDurableSaveAck: options?.onDurableSaveAck,
    onBackgroundSessionSyncStart: options?.onBackgroundSessionSyncStart,
    onBackgroundSessionSyncComplete: options?.onBackgroundSessionSyncComplete,
    onBackgroundSessionSyncError: options?.onBackgroundSessionSyncError,
    syncSource: "saveBpmnState:camunda_extensions",
  };
}
