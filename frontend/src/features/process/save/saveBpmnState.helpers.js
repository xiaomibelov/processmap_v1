import {
  normalizeCamundaExtensionsMap,
  removeCamundaExtensionStateByElementId,
  upsertCamundaExtensionStateByElementId,
} from "../camunda/camundaExtensions.js";
import {
  setVersion as setTrackedDiagramStateVersion,
} from "../../../lib/casVersionTracker.js";
import {
  readAckDiagramStateVersion,
  readConflictServerCurrentVersion,
  resolveBaseVersionAtSendTime,
} from "../../session/casResponse.js";

/**
 * Coerce a value to a trimmed string.
 * @param {unknown} value
 * @returns {string}
 */
export function toText(value) {
  return String(value || "").trim();
}

/**
 * Parse a non-negative integer or return null.
 * @param {unknown} value
 * @returns {number | null}
 */
export function toNonNegativeIntOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Return the value if it is a plain object, otherwise an empty object.
 * @param {unknown} value
 * @returns {Object}
 */
export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Extract diagram_state_version from a save response.
 * Каноническая реализация — features/session/casResponse.js (дисциплина п.10
 * processmap-agents); экспорт сохранён как делегат для callers
 * (fix/save-single-writer-and-unified-cas-base).
 * @param {unknown} response
 * @returns {number | null}
 */
export function pickDiagramStateVersion(response) {
  return readAckDiagramStateVersion(response);
}

/**
 * Read the server's current version from a conflict/error response.
 * Делегат канонической реализации (casResponse.js).
 * @param {unknown} saveResult
 * @returns {number | null}
 */
export function pickServerCurrentVersionFromError(saveResult) {
  return readConflictServerCurrentVersion(saveResult);
}

/**
 * Determine whether a save result represents a diagram-state conflict (409).
 * @param {unknown} saveResult
 * @returns {boolean}
 */
export function isDiagramStateConflict(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 409) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("DIAGRAM_STATE_CONFLICT");
}

/**
 * Determine whether a save result represents a lock failure (423 or explicit message).
 * @param {unknown} saveResult
 * @returns {boolean}
 */
export function isLockFailure(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 423) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("IS BEING UPDATED") || marker.includes("SESSION IS BEING UPDATED");
}

/**
 * Extract server version from an error response if present.
 * Делегат канонической реализации (casResponse.js).
 * @param {unknown} saveResult
 * @returns {number | null}
 */
export function extractServerVersionFromError(saveResult) {
  return readConflictServerCurrentVersion(saveResult);
}

/**
 * Build a fallback session patch payload when the primary save path cannot proceed.
 * @param {Object} params
 * @param {string} params.sid
 * @param {string} params.nextXml
 * @param {Object} params.nextMeta
 * @param {number} params.storedRev
 * @param {number} params.diagramStateVersion
 * @param {string} params.syncSource
 * @returns {Object}
 */
export function buildFallbackSessionPatch({
  sid,
  nextXml,
  nextMeta,
  storedRev,
  diagramStateVersion,
  syncSource,
}) {
  return {
    id: sid,
    session_id: sid,
    bpmn_xml: nextXml,
    bpmn_meta: nextMeta,
    bpmn_xml_version: Number(storedRev || 0),
    version: Number(storedRev || 0),
    diagram_state_version: Number(diagramStateVersion || 0),
    _sync_source: syncSource,
  };
}

/**
 * Pick the base diagram-state version from a session-like object.
 * Falls back through diagram_state_version, bpmn_xml_version, and version.
 * @param {unknown} sessionLike
 * @returns {number | null}
 */
export function pickDiagramStateBaseVersion(sessionLike) {
  const raw = sessionLike && typeof sessionLike === "object"
    ? sessionLike.diagram_state_version ?? sessionLike.bpmn_xml_version ?? sessionLike.version
    : null;
  return toNonNegativeIntOrNull(raw);
}

/**
 * Classify a property operation as add, update, or delete based on current and next maps.
 * @param {Object} currentMap
 * @param {Object} nextMap
 * @param {string} elementId
 * @returns {"property_add" | "property_update" | "property_delete"}
 */
export function derivePropertySourceAction(currentMap, nextMap, elementId) {
  const currentHas = Boolean(currentMap && elementId && currentMap[elementId]);
  const nextHas = Boolean(nextMap && elementId && nextMap[elementId]);
  if (!nextHas) return "property_delete";
  if (!currentHas) return "property_add";
  return "property_update";
}

/**
 * Resolve the authoritative base diagram-state version for a save attempt.
 * Priority: tracked CAS version > getter > explicit option > 0.
 * Делегат канонического resolver'а (casResponse.js) + fallback в 0 для
 * обратной совместимости контракта (возвращает number, не null).
 * @param {string} sessionId
 * @param {Object} [options]
 * @param {Function} [options.getBaseDiagramStateVersion]
 * @param {number} [options.baseDiagramStateVersion]
 * @returns {number}
 */
export function resolveBaseDiagramStateVersion(sessionId, options = {}) {
  const resolved = resolveBaseVersionAtSendTime({
    sessionId,
    getBaseDiagramStateVersion: options.getBaseDiagramStateVersion,
    payload: { baseDiagramStateVersion: options.baseDiagramStateVersion },
  });
  return resolved ?? 0;
}

/**
 * Persist the resolved diagram-state version in trackers and optional callback.
 * @param {string} sessionId
 * @param {number} version
 * @param {Object} [options]
 * @param {Function} [options.rememberDiagramStateVersion]
 * @returns {void}
 */
export function rememberDiagramStateVersion(sessionId, version, options = {}) {
  const normalized = toNonNegativeIntOrNull(version);
  if (normalized === null) return;
  setTrackedDiagramStateVersion(sessionId, normalized);
  if (typeof options.rememberDiagramStateVersion === "function") {
    try {
      options.rememberDiagramStateVersion(normalized, { sessionId });
    } catch {
      // no-op
    }
  }
}

/**
 * Apply a property operation (add/update/delete) to a Camunda extension state map.
 * @param {string} operation
 * @param {Object} currentMap
 * @param {Object} [payload]
 * @param {string} [payload.elementId]
 * @param {string} [payload.propertyName]
 * @param {unknown} [payload.propertyValue]
 * @returns {Object}
 */
export function applyPropertyOperation(operation, currentMap, payload = {}) {
  const map = normalizeCamundaExtensionsMap(currentMap);
  const elementId = toText(payload.elementId);
  if (!elementId) return map;

  const type = toText(operation);
  if (type === "property_delete" && payload.propertyName === undefined) {
    return removeCamundaExtensionStateByElementId(map, elementId);
  }

  const state = map[elementId] || {
    properties: { extensionProperties: [], extensionListeners: [] },
    preservedExtensionElements: [],
  };
  const props = [...(state.properties?.extensionProperties || [])];
  const name = toText(payload.propertyName);

  if (type === "property_add") {
    props.push({
      id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      value: payload.propertyValue ?? "",
    });
  } else if (type === "property_update") {
    const idx = props.findIndex((p) => toText(p?.name) === name);
    if (idx >= 0) {
      props[idx] = { ...props[idx], value: payload.propertyValue ?? "" };
    } else {
      props.push({
        id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        value: payload.propertyValue ?? "",
      });
    }
  } else if (type === "property_delete") {
    const deleteName = toText(payload.propertyName);
    const filtered = props.filter((p) => toText(p?.name) !== deleteName);
    if (filtered.length === props.length) return map;
    const nextState = { ...state, properties: { ...state.properties, extensionProperties: filtered } };
    return upsertCamundaExtensionStateByElementId(map, elementId, nextState);
  }

  const nextState = { ...state, properties: { ...state.properties, extensionProperties: props } };
  return upsertCamundaExtensionStateByElementId(map, elementId, nextState);
}
