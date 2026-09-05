// Сборка опций saveBpmnState для save_all batch — перенесена дословно из
// App.jsx (handleSaveAllBatch → вызов saveBpmnState, был :1096-1114).
// Contour canvas-save-pipeline-extraction-v1 (п.2). MOVE, NOT REWRITE:
// значения, порядок ключей и семантика колбэков не изменены.
//
// Замыкания на App-state заменены параметрами:
//   - draft?.project_id → projectId
//   - draft?.bpmn_meta  → bpmnMeta
//   - bpmnStageRef      → параметр (ref-объект; getBase/remember/getSnapshot
//                         делегируют на bpmnStageRef.current, как в оригинале)
export function buildSaveAllBatchOptions({
  sid,
  xml,
  projectId,
  bpmnMeta,
  apiPutBpmnXml,
  flushSave,
  apiGetSession,
  apiGetBpmnXml,
  onSessionSync,
  overwriteBpmnSnapshot,
  bpmnStageRef,
}) {
  return {
    operation: "session_save",
    sessionId: sid,
    isLocal: false,
    baseDiagramStateVersion: bpmnStageRef.current?.getBaseDiagramStateVersion?.() ?? 0,
    getBaseDiagramStateVersion: () => bpmnStageRef.current?.getBaseDiagramStateVersion?.(),
    rememberDiagramStateVersion: (version) => bpmnStageRef.current?.rememberDiagramStateVersion?.(version, { sessionId: sid }),
    projectId,
    xml,
    nextMeta: bpmnMeta,
    apiPutBpmnXml,
    flushSave,
    apiGetSession,
    apiGetBpmnXml,
    onSessionSync,
    overwriteBpmnSnapshot,
    backgroundSessionRefresh: true,
    syncSource: "saveBpmnState:save_all",
  };
}
