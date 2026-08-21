function toText(value) {
  return String(value || "").trim();
}

export default function applySessionMetaHydration({
  sid,
  activeSessionId,
  source = "session_sync",
  payloadRaw,
  conflictGuard,
  mergeDraft,
  prevDraft,
}) {
  const sessionId = toText(sid);
  const activeSid = toText(activeSessionId);
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  if (!sessionId) {
    return { applied: false, reason: "missing_sid", nextDraft: prevDraft };
  }
  if (activeSid && sessionId !== activeSid) {
    return { applied: false, reason: "inactive_session", nextDraft: prevDraft };
  }
  const guardDecision = conflictGuard?.shouldApplyHydration?.(payload) || { apply: true, reason: "no_guard" };
  if (!guardDecision.apply) {
    return {
      applied: false,
      reason: String(guardDecision.reason || "guard_rejected"),
      guardDecision,
      nextDraft: prevDraft,
    };
  }
  const nextDraft = typeof mergeDraft === "function"
    ? mergeDraft(prevDraft, sessionId, payload, source)
    : prevDraft;
  return {
    applied: true,
    reason: "applied",
    guardDecision,
    nextDraft,
  };
}
