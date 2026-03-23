import { shouldAdoptRemoteBpmnXml } from "../../../sessions/live-sync/remoteBpmnApply.js";

function toText(value) {
  return String(value || "").trim();
}

export function evaluateRemoteRecoveryImportBoundary({
  sessionId,
  draftSessionId,
  remoteVersionToken,
  localVersionToken,
  lastAppliedRemoteVersionToken,
  forceApplyRemoteVersionToken,
  xmlDirty,
  currentXml,
  draftXml,
} = {}) {
  const applyDecision = shouldAdoptRemoteBpmnXml({
    sessionId: toText(sessionId),
    draftSessionId: toText(draftSessionId),
    remoteVersionToken: toText(remoteVersionToken),
    localVersionToken: toText(localVersionToken),
    lastAppliedRemoteVersionToken: toText(lastAppliedRemoteVersionToken),
    forceApplyRemoteVersionToken: toText(forceApplyRemoteVersionToken),
    xmlDirty: xmlDirty === true,
    currentXml: String(currentXml || ""),
    draftXml: String(draftXml || ""),
  });
  return {
    apply: applyDecision.apply === true,
    reason: toText(applyDecision.reason) || (applyDecision.apply ? "remote_sync_recovery" : "skip"),
    remoteToken: toText(remoteVersionToken),
  };
}

export default evaluateRemoteRecoveryImportBoundary;
