function toText(value) {
  return String(value || "").trim();
}

export function shouldAdoptRemoteBpmnXml({
  sessionId = "",
  draftSessionId = "",
  remoteVersionToken = "",
  localVersionToken = "",
  lastAppliedRemoteVersionToken = "",
  forceApplyRemoteVersionToken = "",
  xmlDirty = false,
  currentXml = "",
  draftXml = "",
} = {}) {
  const sid = toText(sessionId);
  const draftSid = toText(draftSessionId);
  const remoteToken = toText(remoteVersionToken);
  const localToken = toText(localVersionToken);
  const lastRemoteToken = toText(lastAppliedRemoteVersionToken);
  const forceRemoteToken = toText(forceApplyRemoteVersionToken);
  const forceApply = !!forceRemoteToken && forceRemoteToken === remoteToken;
  const current = String(currentXml || "");
  const incoming = String(draftXml || "");

  if (!sid) return { apply: false, reason: "missing_session_id" };
  if (!draftSid || draftSid !== sid) return { apply: false, reason: "draft_session_mismatch" };
  if (!remoteToken) return { apply: false, reason: "missing_remote_token" };
  if (localToken && remoteToken === localToken) return { apply: false, reason: "remote_token_matches_local" };
  if (remoteToken === lastRemoteToken) return { apply: false, reason: "remote_token_already_applied" };
  if (!forceApply && xmlDirty === true) return { apply: false, reason: "xml_editor_dirty" };
  if (!incoming.trim()) return { apply: false, reason: "incoming_xml_empty" };
  if (incoming === current) return { apply: false, reason: "xml_equivalent" };
  if (forceApply) return { apply: true, reason: "apply_remote_bpmn_xml_forced" };
  return { apply: true, reason: "apply_remote_bpmn_xml" };
}

export default shouldAdoptRemoteBpmnXml;
