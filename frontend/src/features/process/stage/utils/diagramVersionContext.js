export function normalizeDiagramSessionId(value) {
  return String(value || "").trim();
}

export function normalizeDiagramStateVersion(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const rawVersion = Number(value);
  if (!Number.isFinite(rawVersion) || rawVersion < 0) return null;
  return Math.round(rawVersion);
}

export function isDiagramVersionSessionMatch(activeSessionId, candidateSessionId) {
  const activeSid = normalizeDiagramSessionId(activeSessionId);
  const candidateSid = normalizeDiagramSessionId(candidateSessionId);
  if (!activeSid || !candidateSid) return false;
  return activeSid === candidateSid;
}

export function rememberMonotonicDiagramStateVersion({
  activeSessionId,
  storedSessionId,
  storedVersion,
  incomingSessionId,
  incomingVersion,
} = {}) {
  const activeSid = normalizeDiagramSessionId(activeSessionId);
  const targetSid = normalizeDiagramSessionId(incomingSessionId || activeSid);
  const rememberedSid = normalizeDiagramSessionId(storedSessionId);
  const rememberedVersion = normalizeDiagramStateVersion(storedVersion);
  const fallbackVersion = rememberedVersion ?? 0;

  if (!activeSid) {
    return {
      accepted: false,
      sessionId: "",
      version: 0,
    };
  }

  if (!isDiagramVersionSessionMatch(activeSid, targetSid)) {
    return {
      accepted: false,
      sessionId: rememberedSid,
      version: fallbackVersion,
    };
  }

  const normalizedIncomingVersion = normalizeDiagramStateVersion(incomingVersion);
  if (normalizedIncomingVersion === null) {
    const isSessionSwitch = rememberedSid !== activeSid;
    return {
      accepted: false,
      sessionId: isSessionSwitch ? activeSid : rememberedSid,
      version: isSessionSwitch ? 0 : fallbackVersion,
    };
  }

  if (rememberedSid !== activeSid) {
    return {
      accepted: true,
      sessionId: activeSid,
      version: normalizedIncomingVersion,
    };
  }

  return {
    accepted: true,
    sessionId: activeSid,
    version: Math.max(fallbackVersion, normalizedIncomingVersion),
  };
}

export function resolveDiagramBaseVersionForActiveSession({
  activeSessionId,
  storedSessionId,
  storedVersion,
}) {
  if (!isDiagramVersionSessionMatch(activeSessionId, storedSessionId)) return null;
  return normalizeDiagramStateVersion(storedVersion);
}
