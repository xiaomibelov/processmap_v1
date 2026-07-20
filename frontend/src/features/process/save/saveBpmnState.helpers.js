import {
  normalizeCamundaExtensionsMap,
  removeCamundaExtensionStateByElementId,
  upsertCamundaExtensionStateByElementId,
} from "../camunda/camundaExtensions.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
} from "../../../lib/casVersionTracker.js";

export function toText(value) {
  return String(value || "").trim();
}

export function toNonNegativeIntOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function pickDiagramStateVersion(response) {
  if (!response || typeof response !== "object") return null;
  const raw = response.diagram_state_version ?? response.diagramStateVersion;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function pickServerCurrentVersionFromError(saveResult) {
  const detail = saveResult?.data?.detail;
  if (detail && typeof detail === "object") {
    const v = Number(detail.server_current_version ?? detail.serverCurrentVersion ?? -1);
    if (Number.isFinite(v) && v >= 0) return Math.round(v);
  }
  return null;
}

export function isDiagramStateConflict(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 409) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("DIAGRAM_STATE_CONFLICT");
}

export function isLockFailure(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 423) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("IS BEING UPDATED") || marker.includes("SESSION IS BEING UPDATED");
}

export function extractServerVersionFromError(saveResult) {
  const detail = saveResult?.data?.detail;
  if (detail && typeof detail === "object") {
    const v = Number(detail.server_current_version ?? detail.serverCurrentVersion ?? -1);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

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

export function pickDiagramStateBaseVersion(sessionLike) {
  const raw = sessionLike && typeof sessionLike === "object"
    ? sessionLike.diagram_state_version ?? sessionLike.bpmn_xml_version ?? sessionLike.version
    : null;
  return toNonNegativeIntOrNull(raw);
}

export function derivePropertySourceAction(currentMap, nextMap, elementId) {
  const currentHas = Boolean(currentMap && elementId && currentMap[elementId]);
  const nextHas = Boolean(nextMap && elementId && nextMap[elementId]);
  if (!nextHas) return "property_delete";
  if (!currentHas) return "property_add";
  return "property_update";
}

export function resolveBaseDiagramStateVersion(sessionId, options = {}) {
  const tracked = getTrackedDiagramStateVersion(sessionId);
  const fromGetter = toNonNegativeIntOrNull(
    typeof options.getBaseDiagramStateVersion === "function"
      ? options.getBaseDiagramStateVersion()
      : null,
  );
  const fromOption = toNonNegativeIntOrNull(options.baseDiagramStateVersion);
  return tracked ?? fromGetter ?? fromOption ?? 0;
}

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
