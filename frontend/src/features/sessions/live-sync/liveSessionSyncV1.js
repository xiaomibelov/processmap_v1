function toText(value) {
  return String(value || "").trim();
}

function toInt(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
}

function normalizeVersionToken(value) {
  return toText(value);
}

export function buildSessionVersionToken(sessionRaw) {
  const session = sessionRaw && typeof sessionRaw === "object" ? sessionRaw : {};
  const explicitToken = normalizeVersionToken(session.sync_version_token ?? session.syncVersionToken);
  if (explicitToken) return explicitToken;
  const version = toInt(session.version);
  const bpmnXmlVersion = toInt(session.bpmn_xml_version ?? session.bpmnXmlVersion);
  const updatedAt = toInt(session.updated_at ?? session.updatedAt);
  return `${version}.${bpmnXmlVersion}.${updatedAt}`;
}

export function normalizeSessionSyncStatePayload(payloadRaw, fallbackSessionId = "") {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const sessionId = toText(payload.session_id || fallbackSessionId);
  const version = toInt(payload.version);
  const bpmnXmlVersion = toInt(payload.bpmn_xml_version ?? payload.bpmnXmlVersion);
  const updatedAt = toInt(payload.updated_at ?? payload.updatedAt);
  const versionToken = toText(payload.version_token) || `${version}.${bpmnXmlVersion}.${updatedAt}`;
  const bpmnVersionToken = toText(payload.bpmn_version_token ?? payload.bpmnVersionToken);
  const collabVersionToken = toText(payload.collab_version_token ?? payload.collabVersionToken);
  return {
    session_id: sessionId,
    version,
    bpmn_xml_version: bpmnXmlVersion,
    updated_at: updatedAt,
    bpmn_graph_fingerprint: toText(payload.bpmn_graph_fingerprint),
    version_token: versionToken,
    bpmn_version_token: bpmnVersionToken,
    collab_version_token: collabVersionToken,
  };
}

export function hasUnsafeLocalSessionState(uiStateRaw) {
  return !!deriveUnsafeLocalSessionSyncReason(uiStateRaw);
}

export function deriveUnsafeLocalSessionSyncReason(uiStateRaw) {
  const uiState = uiStateRaw && typeof uiStateRaw === "object" ? uiStateRaw : {};
  const save = uiState.save && typeof uiState.save === "object" ? uiState.save : {};
  if (save.isSaving === true || uiState.isManualSaveBusy === true) return "saving";
  if (save.isDirty === true) return "dirty";
  return "";
}

export function decideRemoteSessionSyncAction({
  localVersionToken,
  remoteVersionToken,
  acknowledgedRemoteVersionToken = "",
  unsafeLocal = false,
  unsafeLocalReason = "",
  postSaveDirtyGraceActive = false,
}) {
  const localToken = normalizeVersionToken(localVersionToken);
  const remoteToken = normalizeVersionToken(remoteVersionToken);
  const acknowledgedToken = normalizeVersionToken(acknowledgedRemoteVersionToken);
  const normalizedUnsafeReason = toText(unsafeLocalReason).toLowerCase();
  const unsafeReason = normalizedUnsafeReason || (unsafeLocal ? "dirty" : "");
  if (!remoteToken || remoteToken === localToken) return "noop";
  if (acknowledgedToken && remoteToken === acknowledgedToken) return "noop";
  if (unsafeReason === "saving") return "defer";
  if (unsafeReason === "dirty" && postSaveDirtyGraceActive) return "defer";
  if (unsafeReason) return "mark_stale";
  return "auto_apply";
}

export function decideRemoteSessionApplyScope({
  localBpmnVersionToken = "",
  localCollabVersionToken = "",
  remoteBpmnVersionToken = "",
  remoteCollabVersionToken = "",
}) {
  const localBpmn = normalizeVersionToken(localBpmnVersionToken);
  const localCollab = normalizeVersionToken(localCollabVersionToken);
  const remoteBpmn = normalizeVersionToken(remoteBpmnVersionToken);
  const remoteCollab = normalizeVersionToken(remoteCollabVersionToken);
  if (!remoteBpmn || !localBpmn) return "full";
  if (remoteBpmn !== localBpmn) return "full";
  if (!remoteCollab || !localCollab) return "full";
  if (remoteCollab === localCollab) return "full";
  return "collab_only";
}
