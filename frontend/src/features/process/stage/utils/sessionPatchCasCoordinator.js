import { normalizeDiagramSessionId, normalizeDiagramStateVersion } from "./diagramVersionContext.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
} from "../../../../lib/casVersionTracker.js";
import { saveCoordinator } from "../../../../features/session/saveCoordinator.js";
import { stripDraftGraphKeysFromSessionPatch } from "../../lib/xmlTruthSession.js";

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
    // FIX-BPMN-IMPORT-SAVE: для XML-truth сессий (непустой bpmn_xml) nodes/edges
    // — мёртвая draft-модель; бэкенд отклоняет их 409 DRAFT_GRAPH_READ_ONLY_XML_TRUTH
    // (_legacy_main.py:899-920). Единая точка strip'а для ВСЕХ session-PATCH записей
    // (import sync, diagram/interview autosave, hydrate). Истина — PUT /bpmn.
    const { patch: strippedPatch } = stripDraftGraphKeysFromSessionPatch(patch, payload?.isXmlTruthSession === true);
    return { patchBody: strippedPatch, apiPatchSession: payload?.apiPatchSession };
  },
  getBaseVersion: (sessionId, payload) => resolveSessionPatchBaseAtSendTime({
    sessionId,
    getBaseDiagramStateVersion: payload?.getBaseDiagramStateVersion,
    fallbackBaseDiagramStateVersion: payload?.patch?.base_diagram_state_version ?? payload?.patch?.baseDiagramStateVersion,
  }),
  onSuccess: (response, sessionId, payload) => {
    // CAS bump is handled by saveCoordinator._runPipeline (single source of truth).
    // Only sync the version to external React state here.
    syncVersionToExternalState(payload?.rememberDiagramStateVersion, readSessionPatchAckDiagramStateVersion(response), sessionId);
  },
  on409: (response, sessionId, payload) => {
    // P1: tracked-base НЕ подменяется серверной версией — saveCoordinator
    // ставит conflict gate; синхронизируем только внешнее React-состояние.
    syncVersionToExternalState(
      payload?.rememberDiagramStateVersion,
      readSessionPatchConflictServerCurrentVersion(response),
      sessionId,
      { updateTracker: false },
    );
  },
  onError: () => {
    // CAS rollback is handled by saveCoordinator._runPipeline.
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

function syncVersionToExternalState(rememberDiagramStateVersion, version, sessionId, options = {}) {
  const normalizedVersion = normalizeDiagramStateVersion(version);
  const sid = normalizeDiagramSessionId(sessionId);
  if (normalizedVersion === null || !sid) return;
  // The coordinator's generic pickServerCurrentVersion may not cover all response
  // formats (e.g. meta pipeline returns data.server_current_version without nested
  // detail). On success the tracker is set to the acked version via setVersion
  // which is idempotent (replaces entire history). On 409 the tracker must NOT
  // be touched (P1: no silent base adoption — conflict gate instead).
  if (options?.updateTracker !== false) {
    setTrackedDiagramStateVersion(sid, normalizedVersion);
  }
  if (typeof rememberDiagramStateVersion !== "function") return;
  try {
    rememberDiagramStateVersion(normalizedVersion, { sessionId: sid });
  } catch {
    // Best-effort external state update.
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
  isXmlTruthSession,
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
    isXmlTruthSession: isXmlTruthSession === true,
  });
}
