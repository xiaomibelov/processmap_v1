import { isLocalSessionId } from "../../../components/process/interview/utils.js";
import {
  normalizeCamundaExtensionsMap,
  removeCamundaExtensionStateByElementId,
  upsertCamundaExtensionStateByElementId,
} from "../camunda/camundaExtensions.js";
import {
  getVersion as getTrackedDiagramStateVersion,
  setVersion as setTrackedDiagramStateVersion,
  bumpVersion as bumpTrackedDiagramStateVersion,
  rollbackVersion as rollbackTrackedDiagramStateVersion,
} from "../../../lib/casVersionTracker.js";
import { saveCoordinator } from "../../session/saveCoordinator.js";

const XML_PIPELINE_NAME = "xml";
const MODELER_XML_CAPTURE_TIMEOUT_MS = 8000;

function withTimeout(promiseFactory, ms, context) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${context || "operation"} timeout after ${ms}ms`));
    }, Math.max(100, Number(ms) || 8000));
    if (timer && typeof timer.unref === "function") timer.unref();
    Promise.resolve()
      .then(() => promiseFactory())
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

function pickDiagramStateVersion(response) {
  if (!response || typeof response !== "object") return null;
  const raw = response.diagram_state_version ?? response.diagramStateVersion;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function pickServerCurrentVersionFromError(saveResult) {
  const detail = saveResult?.data?.detail;
  if (detail && typeof detail === "object") {
    const v = Number(detail.server_current_version ?? detail.serverCurrentVersion ?? -1);
    if (Number.isFinite(v) && v >= 0) return Math.round(v);
  }
  return null;
}

saveCoordinator.registerPipeline(XML_PIPELINE_NAME, {
  transport: async (sessionId, payload) => {
    const useFlushSave = payload?.useFlushSave === true && typeof payload.flushSave === "function";
    if (useFlushSave) {
      return payload.flushSave(payload.sourceAction, {
        xmlOverride: payload.xml,
        baseDiagramStateVersion: payload.baseDiagramStateVersion,
        sourceAction: payload.sourceAction,
        bpmnMeta: payload.bpmnMeta,
      });
    }
    if (typeof payload.apiPutBpmnXml === "function") {
      return payload.apiPutBpmnXml(sessionId, payload.xml, {
        sourceAction: payload.sourceAction,
        baseDiagramStateVersion: payload.baseDiagramStateVersion,
        bpmnMeta: payload.bpmnMeta,
      });
    }
    return { ok: false, status: 0, error: "xml transport unavailable" };
  },
  buildPayload: (payload) => payload,
  getBaseVersion: (sessionId, payload) => {
    const tracked = getTrackedDiagramStateVersion(sessionId);
    if (tracked !== null) return tracked;
    const fromGetter = typeof payload?.getBaseDiagramStateVersion === "function"
      ? Number(payload.getBaseDiagramStateVersion())
      : NaN;
    if (Number.isFinite(fromGetter) && fromGetter >= 0) return Math.round(fromGetter);
    const fromOption = Number(payload?.baseDiagramStateVersion);
    if (Number.isFinite(fromOption) && fromOption >= 0) return Math.round(fromOption);
    return null;
  },
  onSuccess: (response, sessionId, payload) => {
    const version = pickDiagramStateVersion(response);
    if (version !== null) {
      bumpTrackedDiagramStateVersion(sessionId, version);
      try {
        payload?.rememberDiagramStateVersion?.(version, { sessionId });
      } catch {
        // no-op
      }
    }
  },
  on409: (response, sessionId, payload) => {
    rollbackTrackedDiagramStateVersion(sessionId);
    const serverVersion = pickServerCurrentVersionFromError(response);
    if (serverVersion !== null) {
      setTrackedDiagramStateVersion(sessionId, serverVersion);
      try {
        payload?.rememberDiagramStateVersion?.(serverVersion, { sessionId });
      } catch {
        // no-op
      }
    }
  },
  onError: (_response, sessionId) => {
    rollbackTrackedDiagramStateVersion(sessionId);
  },
  debounceMs: 0,
  retryCount: 3,
  retryDelayMs: 1000,
  transportTimeoutMs: 10000,
  maxRetryDelayMs: 4000,
});

function toText(value) {
  return String(value || "").trim();
}

function toNonNegativeIntOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function resolveBaseDiagramStateVersion(sessionId, options = {}) {
  const tracked = getTrackedDiagramStateVersion(sessionId);
  const fromGetter = toNonNegativeIntOrNull(
    typeof options.getBaseDiagramStateVersion === "function"
      ? options.getBaseDiagramStateVersion()
      : null,
  );
  const fromOption = toNonNegativeIntOrNull(options.baseDiagramStateVersion);
  return tracked ?? fromGetter ?? fromOption ?? 0;
}

function rememberDiagramStateVersion(sessionId, version, options = {}) {
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

function bumpDiagramStateVersion(sessionId, version, options = {}) {
  const normalized = toNonNegativeIntOrNull(version);
  if (normalized === null) return;
  bumpTrackedDiagramStateVersion(sessionId, normalized);
  if (typeof options.rememberDiagramStateVersion === "function") {
    try {
      options.rememberDiagramStateVersion(normalized, { sessionId });
    } catch {
      // no-op
    }
  }
}

function isDiagramStateConflict(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 409) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("DIAGRAM_STATE_CONFLICT");
}

function isLockFailure(saveResult) {
  const status = Number(saveResult?.status || 0);
  if (status === 423) return true;
  const marker = `${String(saveResult?.error || "")} ${String(saveResult?.text || "")}`.toUpperCase();
  return marker.includes("IS BEING UPDATED") || marker.includes("SESSION IS BEING UPDATED");
}

function extractServerVersionFromError(saveResult) {
  const detail = saveResult?.data?.detail;
  if (detail && typeof detail === "object") {
    const v = Number(detail.server_current_version ?? detail.serverCurrentVersion ?? -1);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

function buildFallbackSessionPatch({
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

function pickDiagramStateBaseVersion(sessionLike) {
  const raw = sessionLike && typeof sessionLike === "object"
    ? sessionLike.diagram_state_version ?? sessionLike.bpmn_xml_version ?? sessionLike.version
    : null;
  return toNonNegativeIntOrNull(raw);
}

function derivePropertySourceAction(currentMap, nextMap, elementId) {
  const currentHas = Boolean(currentMap && elementId && currentMap[elementId]);
  const nextHas = Boolean(nextMap && elementId && nextMap[elementId]);
  if (!nextHas) return "property_delete";
  if (!currentHas) return "property_add";
  return "property_update";
}

/**
 * Unified BPMN save entry point.
 *
 * All mutations (property add/delete/update and session save) go through a
 * single XML PUT to /api/sessions/:id/bpmn with strict CAS and a source_action
 * hint. Property-only saves do not create user-facing BPMN revision snapshots.
 *
 * @param {Object} options
 * @param {string} options.operation - 'property_add' | 'property_delete' | 'property_update' | 'session_save'
 * @param {string} options.sessionId
 * @param {boolean} [options.isLocal]
 * @param {number} options.baseDiagramStateVersion
 * @param {string} [options.projectId]
 * @param {string} [options.elementId] - element id for property operations
 * @param {Object} [options.currentCamundaExtensionsByElementId]
 * @param {Object} [options.nextCamundaExtensionsByElementId]
 * @param {string} [options.currentXml]
 * @param {string} [options.xml] - explicit XML for session_save
 * @param {Object} [options.currentMeta]
 * @param {Object} [options.nextMeta]
 * @param {() => Promise<string>} [options.getModelerXml]
 * @param {(sessionId, xml, opts) => Promise<Object>} options.apiPutBpmnXml
 * @param {(reason, opts) => Promise<Object>} [options.flushSave] - coordinator flushSave for property operations
 * @param {(sessionId) => Promise<Object>} [options.apiGetSession]
 * @param {(sessionId) => Promise<{ok:boolean, xml?:string}>} [options.apiGetBpmnXml]
 * @param {(patch) => void} [options.onSessionSync]
 * @param {(ack) => void} [options.onDurableSaveAck]
 * @param {(ctx) => void} [options.onConflict]
 * @param {(payload) => Promise<void>} [options.overwriteBpmnSnapshot]
 * @param {boolean} [options.backgroundSessionRefresh]
 * @param {(ack) => void} [options.onBackgroundSessionSyncStart]
 * @param {(result) => void} [options.onBackgroundSessionSyncComplete]
 * @param {(result) => void} [options.onBackgroundSessionSyncError]
 * @param {string} [options.syncSource]
 */
export async function saveBpmnState(options = {}) {
  const sid = toText(options.sessionId);
  if (!sid) {
    return { ok: false, status: 0, error: "Не выбрана сессия." };
  }

  const isLocal = Boolean(options.isLocal ?? isLocalSessionId(sid));
  const operation = toText(options.operation) || "session_save";
  const elementId = toText(options.elementId);
  const currentMap = normalizeCamundaExtensionsMap(options.currentCamundaExtensionsByElementId);
  const nextMap = normalizeCamundaExtensionsMap(options.nextCamundaExtensionsByElementId);

  const isPropertyOperation = operation.startsWith("property_");
  if (isPropertyOperation && typeof options.flushSave !== "function") {
    return { ok: false, status: 0, error: "flushSave unavailable for property operation" };
  }

  let sourceAction = operation;
  if (isPropertyOperation) {
    sourceAction = operation;
  } else if (operation === "session_save") {
    sourceAction = "manual_save";
  } else if (elementId) {
    sourceAction = derivePropertySourceAction(currentMap, nextMap, elementId);
  }

  let nextXml = "";
  let nextMeta = asObject(options.nextMeta ?? options.currentMeta);

  // The coordinator is the single writer. Property operations always read the
  // live modeler XML (App.jsx applies the extension state to the modeler first).
  // Session saves may supply an explicit XML or fetch it from the modeler.
  const useCoordinatorFlush = typeof options.flushSave === "function";

  if (operation === "session_save") {
    nextXml = toText(options.xml);
    if (!nextXml && typeof options.getModelerXml === "function") {
      try {
        nextXml = toText(await withTimeout(
          () => options.getModelerXml(),
          MODELER_XML_CAPTURE_TIMEOUT_MS,
          "getModelerXml",
        ));
      } catch (error) {
        return { ok: false, status: 0, error: `Не удалось получить XML: ${error?.message || error}` };
      }
    }
    if (!nextXml && !useCoordinatorFlush) {
      return { ok: false, status: 0, error: "Пустая BPMN XML." };
    }
  } else {
    if (!useCoordinatorFlush) {
      return { ok: false, status: 0, error: "flushSave unavailable for property operation" };
    }
    // Property operations already mutate the live modeler in App.jsx.
    // Pre-capture the XML here and pass it to the coordinator as an override.
    // This avoids calling runtime.getXml() deep inside flushSave, where it can
    // deadlock/hang during autosave (observed as a stable 10s transport timeout).
    if (!nextXml && typeof options.getModelerXml === "function") {
      try {
        nextXml = toText(await withTimeout(
          () => options.getModelerXml(),
          MODELER_XML_CAPTURE_TIMEOUT_MS,
          "getModelerXml",
        ));
      } catch (error) {
        return { ok: false, status: 0, error: `Не удалось получить XML: ${error?.message || error}` };
      }
    }
  }

  const baseDiagramStateVersion = resolveBaseDiagramStateVersion(sid, options);

  const syncSource = toText(options.syncSource) || `saveBpmnState:${sourceAction}`;

  // Local-only sessions skip the server entirely.
  if (isLocal) {
    const fallback = buildFallbackSessionPatch({
      sid,
      nextXml,
      nextMeta,
      storedRev: baseDiagramStateVersion,
      diagramStateVersion: baseDiagramStateVersion,
      syncSource,
    });
    options.onSessionSync?.(fallback);
    return {
      ok: true,
      local: true,
      nextXml,
      nextMeta,
      diagramStateVersion: baseDiagramStateVersion,
      storedRev: baseDiagramStateVersion,
    };
  }

  if (typeof options.flushSave !== "function" && typeof options.apiPutBpmnXml !== "function") {
    return { ok: false, status: 0, error: "apiPutBpmnXml unavailable" };
  }

  let saveRes = null;
  let persistedXml = nextXml;
  const persistedMeta = nextMeta;

  const coordinatorPayload = {
    sessionId: sid,
    xml: persistedXml,
    bpmnMeta: persistedMeta,
    sourceAction,
    useFlushSave: useCoordinatorFlush,
    flushSave: options.flushSave,
    apiPutBpmnXml: options.apiPutBpmnXml,
    getBaseDiagramStateVersion: options.getBaseDiagramStateVersion,
    rememberDiagramStateVersion: options.rememberDiagramStateVersion,
    baseDiagramStateVersion,
  };

  try {
    saveRes = await saveCoordinator.execute(XML_PIPELINE_NAME, coordinatorPayload);
  } catch (executeError) {
    return {
      ok: false,
      status: 0,
      error: String(executeError?.message || executeError || "saveCoordinator.execute failed"),
      conflict: false,
    };
  }

  if (saveRes?.ok) {
    // When the coordinator does the actual PUT it returns the serialized XML.
    // Use that real XML for downstream snapshots and session patches instead
    // of an empty placeholder.
    persistedXml = saveRes.xml || persistedXml;
  } else {
    if (isDiagramStateConflict(saveRes)) {
      options.onConflict?.({
        sessionId: sid,
        serverVersion: toNonNegativeIntOrNull(saveRes?.data?.detail?.server_current_version),
        serverLastWrite: saveRes?.data?.detail?.server_last_write,
        clientBaseVersion: baseDiagramStateVersion,
      });
    }
    return {
      ok: false,
      status: Number(saveRes?.status || 0),
      error: String(saveRes?.error || "Не удалось сохранить BPMN."),
      conflict: isDiagramStateConflict(saveRes),
    };
  }

  const diagramStateVersion = Number(saveRes.diagramStateVersion || 0);
  const storedRev = Number(saveRes.storedRev || 0);

  const durableAck = {
    ok: true,
    status: Number(saveRes?.status || 200),
    storedRev,
    diagramStateVersion,
    nextXml: persistedXml,
    nextMeta: persistedMeta,
    bpmnVersionSnapshot: saveRes?.bpmnVersionSnapshot || null,
  };

  options.onDurableSaveAck?.(durableAck);

  // Overwrite local snapshot so it stays in sync with the server.
  if (typeof options.overwriteBpmnSnapshot === "function") {
    try {
      await options.overwriteBpmnSnapshot({
        sessionId: sid,
        projectId: options.projectId,
        xml: persistedXml,
        rev: storedRev,
        reason: "persist_ok",
        status: saveRes?.status,
      });
    } catch {
      // Snapshot overwrite is best-effort.
    }
  }

  const fallbackPatch = buildFallbackSessionPatch({
    sid,
    nextXml: persistedXml,
    nextMeta: persistedMeta,
    storedRev,
    diagramStateVersion,
    syncSource,
  });
  // Property-only saves mutate the modeler in-place. We still update the
  // authoritative draft XML so subsequent saves do not refetch a stale base,
  // but we skip the canvas re-import to preserve viewport.
  fallbackPatch._apply_bpmn_xml = !isPropertyOperation;
  if (isPropertyOperation) {
    fallbackPatch._skip_bpmn_render = Date.now();
  }

  if (options.backgroundSessionRefresh) {
    options.onSessionSync?.(fallbackPatch);
    let backgroundPromise = null;
    if (typeof options.apiGetSession === "function") {
      options.onBackgroundSessionSyncStart?.(durableAck);
      backgroundPromise = (async () => {
        try {
          const fresh = await options.apiGetSession(sid);
          if (fresh?.ok && fresh.session && typeof fresh.session === "object") {
            const freshVersion = pickDiagramStateBaseVersion(fresh.session);
            rememberDiagramStateVersion(sid, freshVersion, options);
            const syncPayload = { ...fresh.session, _sync_source: syncSource };
            if (isPropertyOperation) {
              syncPayload._skip_bpmn_render = Date.now();
            }
            options.onSessionSync?.(syncPayload);
            options.onBackgroundSessionSyncComplete?.({ ok: true, session: syncPayload, durableAck });
            return { ok: true, session: syncPayload };
          }
          const errorPayload = { ok: false, status: Number(fresh?.status || 0), error: String(fresh?.error || "session_refresh_failed"), durableAck };
          options.onBackgroundSessionSyncError?.(errorPayload);
          return errorPayload;
        } catch (error) {
          const errorPayload = { ok: false, status: 0, error: String(error?.message || error || "session_refresh_failed"), durableAck };
          options.onBackgroundSessionSyncError?.(errorPayload);
          return errorPayload;
        }
      })();
    }
    return { ...durableAck, backgroundSessionRefresh: true, backgroundSessionSyncPromise: backgroundPromise };
  }

  // Immediate session sync: prefer a fresh server read, otherwise use the fallback patch.
  let sessionSynced = false;
  if (typeof options.apiGetSession === "function") {
    try {
      const fresh = await options.apiGetSession(sid);
      if (fresh?.ok && fresh.session && typeof fresh.session === "object") {
        const freshVersion = pickDiagramStateBaseVersion(fresh.session);
        rememberDiagramStateVersion(sid, freshVersion, options);
        const syncPayload = { ...fresh.session, _sync_source: syncSource, _apply_bpmn_xml: !isPropertyOperation };
        if (isPropertyOperation) {
          syncPayload._skip_bpmn_render = Date.now();
        }
        options.onSessionSync?.(syncPayload);
        sessionSynced = true;
      }
    } catch {
      // ignore
    }
  }
  if (!sessionSynced) {
    options.onSessionSync?.(fallbackPatch);
  }

  return durableAck;
}

/**
 * Apply a single property operation to a Camunda extension state map.
 *
 * Returns the next map without mutating the input. This helper is useful for
 * callers that want to compute the optimistic next state before invoking
 * saveBpmnState.
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
