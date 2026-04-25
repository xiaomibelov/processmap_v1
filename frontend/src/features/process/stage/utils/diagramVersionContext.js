export function normalizeDiagramSessionId(value) {
  return String(value || "").trim();
}

export function isDiagramVersionSessionMatch(activeSessionId, candidateSessionId) {
  const activeSid = normalizeDiagramSessionId(activeSessionId);
  const candidateSid = normalizeDiagramSessionId(candidateSessionId);
  if (!activeSid || !candidateSid) return false;
  return activeSid === candidateSid;
}

export function resolveDiagramBaseVersionForActiveSession({
  activeSessionId,
  storedSessionId,
  storedVersion,
}) {
  if (!isDiagramVersionSessionMatch(activeSessionId, storedSessionId)) return null;
  const rawVersion = Number(storedVersion);
  if (!Number.isFinite(rawVersion) || rawVersion < 0) return null;
  return Math.round(rawVersion);
}
