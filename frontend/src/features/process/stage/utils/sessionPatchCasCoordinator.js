import { normalizeDiagramSessionId, normalizeDiagramStateVersion } from "./diagramVersionContext.js";

const sessionPatchQueues = new Map();

export function readSessionPatchAckDiagramStateVersion(responseRaw = null) {
  const response = responseRaw && typeof responseRaw === "object" ? responseRaw : {};
  const session = response.session && typeof response.session === "object" ? response.session : {};
  return normalizeDiagramStateVersion(session.diagram_state_version ?? session.diagramStateVersion);
}

export function readSessionPatchConflictServerCurrentVersion(responseRaw = null) {
  const response = responseRaw && typeof responseRaw === "object" ? responseRaw : {};
  const details = response.data && typeof response.data === "object"
    ? response.data
    : response.errorDetails && typeof response.errorDetails === "object"
      ? response.errorDetails
      : response.details && typeof response.details === "object"
        ? response.details
        : {};
  return normalizeDiagramStateVersion(
    response.server_current_version
    ?? response.serverCurrentVersion
    ?? details.server_current_version
    ?? details.serverCurrentVersion,
  );
}

export function resolveSessionPatchBaseAtSendTime({
  getBaseDiagramStateVersion,
  fallbackBaseDiagramStateVersion,
} = {}) {
  const currentBase = normalizeDiagramStateVersion(
    typeof getBaseDiagramStateVersion === "function"
      ? getBaseDiagramStateVersion()
      : null,
  );
  if (currentBase !== null) return currentBase;
  return normalizeDiagramStateVersion(fallbackBaseDiagramStateVersion);
}

function rememberVersion(rememberDiagramStateVersion, version, sessionId) {
  const normalizedVersion = normalizeDiagramStateVersion(version);
  const sid = normalizeDiagramSessionId(sessionId);
  if (normalizedVersion === null || !sid || typeof rememberDiagramStateVersion !== "function") return;
  try {
    rememberDiagramStateVersion(normalizedVersion, { sessionId: sid });
  } catch {
    // Best-effort monotonic context update; callers still receive the original response.
  }
}

export function resetSessionPatchCasCoordinator(sessionId = "") {
  const sid = normalizeDiagramSessionId(sessionId);
  if (sid) {
    sessionPatchQueues.delete(sid);
    return;
  }
  sessionPatchQueues.clear();
}

export function enqueueSessionPatchCasWrite({
  sessionId,
  patch,
  apiPatchSession,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
} = {}) {
  const sid = normalizeDiagramSessionId(sessionId);
  if (!sid || typeof apiPatchSession !== "function") {
    return Promise.resolve({ ok: false, status: 0, error: "missing_session_patch_context" });
  }
  const patchBody = patch && typeof patch === "object" ? { ...patch } : {};
  const previous = sessionPatchQueues.get(sid) || Promise.resolve();

  const run = previous.catch(() => null).then(async () => {
    const baseDiagramStateVersion = resolveSessionPatchBaseAtSendTime({
      getBaseDiagramStateVersion,
      fallbackBaseDiagramStateVersion: patchBody.base_diagram_state_version ?? patchBody.baseDiagramStateVersion,
    });
    const payload = { ...patchBody };
    if (baseDiagramStateVersion !== null) {
      payload.base_diagram_state_version = baseDiagramStateVersion;
    }

    const response = await apiPatchSession(sid, payload);
    if (response?.ok) {
      rememberVersion(rememberDiagramStateVersion, readSessionPatchAckDiagramStateVersion(response), sid);
      return response;
    }
    rememberVersion(rememberDiagramStateVersion, readSessionPatchConflictServerCurrentVersion(response), sid);
    return response;
  });

  const queuePromise = run.finally(() => {
    if (sessionPatchQueues.get(sid) === queuePromise) {
      sessionPatchQueues.delete(sid);
    }
  });
  sessionPatchQueues.set(sid, queuePromise);
  return run;
}
