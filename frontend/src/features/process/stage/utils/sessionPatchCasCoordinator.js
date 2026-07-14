import { normalizeDiagramSessionId, normalizeDiagramStateVersion } from "./diagramVersionContext.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  bumpVersion as bumpTrackedDiagramStateVersion,
  rollbackVersion as rollbackTrackedDiagramStateVersion,
} from "../../../../lib/casVersionTracker.js";
import { saveCoordinator } from "../../../../features/session/saveCoordinator.js";

const PIPELINE_NAME = "meta";

saveCoordinator.registerPipeline(PIPELINE_NAME, {
  transport: async (sessionId, payload) => {
    const apiPatchSession = payload?.apiPatchSession;
    if (typeof apiPatchSession !== "function") {
      return { ok: false, status: 0, error: "missing_session_patch_context" };
    }
    const patchBody = payload?.patchBody && typeof payload.patchBody === "object"
      ? { ...payload.patchBody }
      : {};
    if (payload?.base_diagram_state_version !== undefined) {
      patchBody.base_diagram_state_version = payload.base_diagram_state_version;
    }
    return apiPatchSession(sessionId, patchBody);
  },
  buildPayload: (payload) => {
    const patch = payload?.patch && typeof payload.patch === "object" ? { ...payload.patch } : {};
    delete patch.base_diagram_state_version;
    delete patch.baseDiagramStateVersion;
    return { patchBody: patch, apiPatchSession: payload?.apiPatchSession };
  },
  getBaseVersion: (sessionId, payload) => resolveSessionPatchBaseAtSendTime({
    sessionId,
    getBaseDiagramStateVersion: payload?.getBaseDiagramStateVersion,
    fallbackBaseDiagramStateVersion: payload?.patch?.base_diagram_state_version ?? payload?.patch?.baseDiagramStateVersion,
  }),
  onSuccess: (response, sessionId, payload) => {
    bumpVersion(payload?.rememberDiagramStateVersion, readSessionPatchAckDiagramStateVersion(response), sessionId);
  },
  on409: (response, sessionId, payload) => {
    rememberVersion(payload?.rememberDiagramStateVersion, readSessionPatchConflictServerCurrentVersion(response), sessionId);
  },
  onError: (_response, sessionId) => {
    rollbackTrackedDiagramStateVersion(sessionId);
  },
  debounceMs: 0,
  retryCount: 3,
  retryDelayMs: 1000,
});

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
  sessionId,
  getBaseDiagramStateVersion,
  fallbackBaseDiagramStateVersion,
} = {}) {
  const trackedBase = normalizeDiagramStateVersion(getTrackedDiagramStateVersion(sessionId));
  if (trackedBase !== null) return trackedBase;
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
  if (normalizedVersion === null || !sid) return;
  setTrackedDiagramStateVersion(sid, normalizedVersion);
  if (typeof rememberDiagramStateVersion !== "function") return;
  try {
    rememberDiagramStateVersion(normalizedVersion, { sessionId: sid });
  } catch {
    // Best-effort monotonic context update; callers still receive the original response.
  }
}

function bumpVersion(rememberDiagramStateVersion, version, sessionId) {
  const normalizedVersion = normalizeDiagramStateVersion(version);
  const sid = normalizeDiagramSessionId(sessionId);
  if (normalizedVersion === null || !sid) return;
  bumpTrackedDiagramStateVersion(sid, normalizedVersion);
  if (typeof rememberDiagramStateVersion !== "function") return;
  try {
    rememberDiagramStateVersion(normalizedVersion, { sessionId: sid });
  } catch {
    // no-op
  }
}

export function resetSessionPatchCasCoordinator(sessionId = "") {
  saveCoordinator.clearSession(normalizeDiagramSessionId(sessionId));
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
  return saveCoordinator.execute(PIPELINE_NAME, {
    sessionId: sid,
    patch,
    apiPatchSession,
    getBaseDiagramStateVersion,
    rememberDiagramStateVersion,
  });
}
