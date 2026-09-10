/**
 * casResponse — единый модуль чтения CAS-полей из ответов backend и
 * разрешения base diagram_state_version в момент отправки.
 *
 * Каноническая реализация (skill processmap-agents, дисциплина п.10 —
 * правило единой реализации). Заменяет локальные копии, которые ранее
 * существовали в:
 * - saveCoordinator.js (pickDiagramStateVersion / pickServerCurrentVersion)
 * - createBpmnPersistence.js (pickDiagramStateVersion + inline on409)
 * - sessionPatchCasCoordinator.js (readSessionPatchAckDiagramStateVersion /
 *   readSessionPatchConflictServerCurrentVersion / resolveSessionPatchBaseAtSendTime)
 * - saveBpmnState.helpers.js (pickDiagramStateVersion /
 *   pickServerCurrentVersionFromError)
 * - interviewAnalysisPatchHelper.js (inline onSuccess/on409)
 *
 * Цепочки кандидатов — объединение (union) всех прежних копий, чтобы
 * покрыть все форматы ответов (плоские, session/data-вложенные,
 * FastAPI detail, errorDetails/details).
 */

import {
  getVersion as getTrackedDiagramStateVersion,
} from "../../lib/casVersionTracker.js";

function asNonNegativeInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * diagram_state_version из успешного ack (2xx) save-запроса.
 * @param {Object|null} response
 * @returns {number|null}
 */
export function readAckDiagramStateVersion(response) {
  if (!response || typeof response !== "object") return null;
  const candidates = [
    response.diagram_state_version,
    response.diagramStateVersion,
    response.session?.diagram_state_version,
    response.session?.diagramStateVersion,
    response.data?.diagram_state_version,
    response.data?.diagramStateVersion,
  ];
  for (const raw of candidates) {
    const n = asNonNegativeInt(raw);
    if (n !== null) return n;
  }
  return null;
}

/**
 * server_current_version из 409-ответа (CAS conflict).
 * @param {Object|null} response
 * @returns {number|null}
 */
export function readConflictServerCurrentVersion(response) {
  if (!response || typeof response !== "object") return null;
  const candidates = [
    response.server_current_version,
    response.serverCurrentVersion,
    response.data?.server_current_version,
    response.data?.serverCurrentVersion,
    response.data?.detail?.server_current_version,
    response.data?.detail?.serverCurrentVersion,
    response.errorDetails?.server_current_version,
    response.errorDetails?.serverCurrentVersion,
    response.details?.server_current_version,
    response.details?.serverCurrentVersion,
  ];
  for (const raw of candidates) {
    const n = asNonNegativeInt(raw);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Единый резолвер base version в момент отправки для всех save-pipelines:
 * 1. casVersionTracker (единственный авторитетный источник после первого ack);
 * 2. getter из React-окружения (мост на переходный период);
 * 3. payload option (baseDiagramStateVersion / base_diagram_state_version).
 *
 * @param {Object} args
 * @param {string} [args.sessionId]
 * @param {Object} [args.payload]
 * @param {Function} [args.getBaseDiagramStateVersion]
 * @returns {number|null}
 */
export function resolveBaseVersionAtSendTime({
  sessionId = "",
  payload = null,
  getBaseDiagramStateVersion = null,
} = {}) {
  const tracked = asNonNegativeInt(getTrackedDiagramStateVersion(sessionId));
  if (tracked !== null) return tracked;
  if (typeof getBaseDiagramStateVersion === "function") {
    try {
      const fromGetter = asNonNegativeInt(getBaseDiagramStateVersion());
      if (fromGetter !== null) return fromGetter;
    } catch {
      // fall through to payload
    }
  }
  const fromPayloadCamel = asNonNegativeInt(payload?.baseDiagramStateVersion);
  if (fromPayloadCamel !== null) return fromPayloadCamel;
  return asNonNegativeInt(payload?.base_diagram_state_version);
}
