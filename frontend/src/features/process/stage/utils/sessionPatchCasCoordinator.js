import { normalizeDiagramSessionId, normalizeDiagramStateVersion } from "./diagramVersionContext.js";
import {
  setVersion as setTrackedDiagramStateVersion,
} from "../../../../lib/casVersionTracker.js";
import { saveCoordinator } from "../../../../features/session/saveCoordinator.js";
import { stripDraftGraphKeysFromSessionPatch } from "../../lib/xmlTruthSession.js";
// Правило единой реализации (P2, fix/canvas-editing-stability): readers CAS-полей
// и резолвер base — canonical features/session/casResponse.js.
import {
  readAckDiagramStateVersion,
  readConflictServerCurrentVersion,
  resolveBaseVersionAtSendTime,
} from "../../../../features/session/casResponse.js";
// Правило единой реализации: gate живёт в features/session/patchKeys.js
// (контракт — saveVersion.test.mjs п.13), здесь — делегирующий re-export
// для callers старта процесса (fix/canvas-editing-stability, P0).
export {
  DIAGRAM_PATCH_KEYS,
  METADATA_PATCH_KEYS,
  PRESENCE_PATCH_KEYS,
  hasDiagramPatchKeys,
  isPresenceHeartbeatPatch,
  classifySessionPatch,
} from "../../../../features/session/patchKeys.js";
// fix/self-conflict-silent-rebase: silent self-rebase meta-PATCH над 409 —
// только при полной определённости (disjoint changed_keys) и один раз на
// конфликт. Сомнение → null → честный модал.
import {
  classifyRebaseSafety,
  diagramTruthKeysFromPatch,
  extractConflictDetail,
} from "../../bpmn/save/conflictSilentRebase.js";

const PIPELINE_NAME = "meta";

// Бюджет «один silent retry на конфликт (sid, serverVersion)»: sid →
// serverVersion, на который silent rebase уже выполнен. Повторный 409 с той
// же версией → null → модал (защита от 409-лупы). Семантика чуть шире
// «один на конфликт»: новая серверная версия от другого disjoint-writer —
// новый бюджет (NIT-2, review fix/self-conflict-silent-rebase).
//
// Cleanup (NIT-1): запись удаляется, когда 409 для sid уходит в модал
// (overlap/unknown/нет detail); плюс cap 100 записей (evict самой старой) —
// Map не растёт по числу сессий за жизнь страницы.
const SILENT_REBASE_BUDGET_CAP = 100;
const silentRebaseBudgetBySession = new Map();
const budgetRemember = (sid, serverVersion) => {
  if (silentRebaseBudgetBySession.size >= SILENT_REBASE_BUDGET_CAP) {
    const oldest = silentRebaseBudgetBySession.keys().next().value;
    if (oldest !== undefined) silentRebaseBudgetBySession.delete(oldest);
  }
  silentRebaseBudgetBySession.set(sid, serverVersion);
};
const budgetForget = (sid) => {
  silentRebaseBudgetBySession.delete(sid);
};

saveCoordinator.registerPipeline(PIPELINE_NAME, {
  // C3/S1: meta не участвует в mutation lane — per-pipeline очередь и
  // disjoint-key семантика (silent-rebase контракт C2) сохраняются.
  mutationLane: false,
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
  trySilentRebase: async (response, sessionId, builtPayload) => {
    const detail = extractConflictDetail(response);
    if (!detail) {
      budgetForget(sessionId);
      return null;
    }
    const safety = classifyRebaseSafety({
      serverChangedKeys: detail.changedKeys,
      localDirtyKeys: diagramTruthKeysFromPatch(builtPayload?.patchBody),
    });
    if (safety !== "disjoint") {
      // 409 уходит в модал — конфликт исчерпан, бюджет освобождаем.
      budgetForget(sessionId);
      return null;
    }
    if (silentRebaseBudgetBySession.get(sessionId) === detail.serverVersion) return null;
    const apiPatchSession = builtPayload?.apiPatchSession;
    if (typeof apiPatchSession !== "function") return null;
    budgetRemember(sessionId, detail.serverVersion);
    const retried = await apiPatchSession(sessionId, {
      ...(builtPayload?.patchBody && typeof builtPayload.patchBody === "object" ? builtPayload.patchBody : {}),
      base_diagram_state_version: detail.serverVersion,
    });
    if (!retried || retried.ok === false) return null;
    return {
      ok: true,
      status: 200,
      diagramStateVersion: readSessionPatchAckDiagramStateVersion(retried) ?? detail.serverVersion,
    };
  },
  debounceMs: 0,
  retryCount: 3,
  retryDelayMs: 1000,
});

// Канонические реализации — features/session/casResponse.js (правило единой
// реализации). Экспорты сохранены как делегаты для существующих callers.
export function readSessionPatchAckDiagramStateVersion(responseRaw = null) {
  return readAckDiagramStateVersion(responseRaw);
}

export function readSessionPatchConflictServerCurrentVersion(responseRaw = null) {
  return readConflictServerCurrentVersion(responseRaw);
}

export function resolveSessionPatchBaseAtSendTime({
  sessionId,
  getBaseDiagramStateVersion,
  fallbackBaseDiagramStateVersion,
} = {}) {
  return resolveBaseVersionAtSendTime({
    sessionId,
    getBaseDiagramStateVersion,
    payload: { base_diagram_state_version: fallbackBaseDiagramStateVersion },
  });
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
