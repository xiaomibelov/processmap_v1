import { isLocalSessionId } from "../../../components/process/interview/utils.js";
import {
  finalizeCamundaExtensionsXml,
  normalizeCamundaExtensionsMap,
  removeCamundaExtensionStateByElementId,
  upsertCamundaExtensionStateByElementId,
} from "../camunda/camundaExtensions.js";

function toText(value) {
  return String(value || "").trim();
}

function toNonNegativeIntOrNull(value) {
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

function buildCanonicalXml({ currentXml, nextCamundaExtensionsByElementId }) {
  const normalizedMap = normalizeCamundaExtensionsMap(nextCamundaExtensionsByElementId);
  const nextXml = finalizeCamundaExtensionsXml({
    xmlText: currentXml,
    camundaExtensionsByElementId: normalizedMap,
  });
  return String(nextXml || "");
}

function updateLastServerVersion(ref, value) {
  const v = toNonNegativeIntOrNull(value);
  if (v === null) return;
  if (ref && ref.current !== undefined) {
    ref.current = Math.max(ref.current ?? 0, v);
  }
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
 * @param {React.MutableRefObject<number>} [options.lastServerDiagramStateVersionRef]
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
  let sourceAction = operation;
  if (isPropertyOperation) {
    sourceAction = operation;
  } else if (operation === "session_save") {
    sourceAction = "manual_save";
  } else if (elementId) {
    sourceAction = derivePropertySourceAction(currentMap, nextMap, elementId);
  }

  let currentXml = "";
  let nextXml = "";
  let nextMeta = asObject(options.nextMeta ?? options.currentMeta);

  if (operation === "session_save") {
    currentXml = toText(options.xml);
    if (!currentXml && typeof options.getModelerXml === "function") {
      try {
        currentXml = toText(await options.getModelerXml());
      } catch (error) {
        return { ok: false, status: 0, error: `Не удалось получить XML: ${error?.message || error}` };
      }
    }
    nextXml = currentXml;
  } else {
    currentXml = toText(options.currentXml);
    if (!currentXml && typeof options.getModelerXml === "function") {
      try {
        currentXml = toText(await options.getModelerXml());
      } catch (error) {
        return { ok: false, status: 0, error: `Не удалось получить XML: ${error?.message || error}` };
      }
    }
    if (!currentXml && typeof options.apiGetBpmnXml === "function") {
      try {
        const xmlRes = await options.apiGetBpmnXml(sid);
        if (xmlRes?.ok) {
          currentXml = toText(xmlRes.xml);
        }
      } catch {
        // ignore
      }
    }
    if (!currentXml && typeof options.apiGetSession === "function") {
      try {
        const latest = await options.apiGetSession(sid);
        if (latest?.ok && latest.session && typeof latest.session === "object") {
          currentXml = toText(latest.session.bpmn_xml);
          updateLastServerVersion(options.lastServerDiagramStateVersionRef, pickDiagramStateBaseVersion(latest.session));
        }
      } catch {
        // ignore
      }
    }
    if (!currentXml) {
      return { ok: false, status: 0, error: "Отсутствует BPMN XML для применения Properties." };
    }
    nextXml = buildCanonicalXml({ currentXml, nextCamundaExtensionsByElementId: nextMap });
    if (!nextXml) {
      return { ok: false, status: 0, error: "Не удалось применить Properties к BPMN XML." };
    }
  }

  if (!nextXml) {
    return { ok: false, status: 0, error: "Пустая BPMN XML." };
  }

  const baseDiagramStateVersion = toNonNegativeIntOrNull(
    options.lastServerDiagramStateVersionRef?.current ?? options.baseDiagramStateVersion,
  ) ?? 0;

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

  if (typeof options.apiPutBpmnXml !== "function") {
    return { ok: false, status: 0, error: "apiPutBpmnXml unavailable" };
  }

  let attempt = 0;
  const maxAttempts = 3;
  let saveRes = null;
  let persistedXml = nextXml;
  let persistedMeta = nextMeta;

  while (attempt < maxAttempts) {
    attempt += 1;
    const attemptBaseVersion = toNonNegativeIntOrNull(
      options.lastServerDiagramStateVersionRef?.current ?? baseDiagramStateVersion,
    ) ?? 0;

    saveRes = await options.apiPutBpmnXml(sid, persistedXml, {
      sourceAction,
      baseDiagramStateVersion: attemptBaseVersion,
      bpmnMeta: persistedMeta,
    });

    if (saveRes?.ok) {
      updateLastServerVersion(options.lastServerDiagramStateVersionRef, saveRes.diagramStateVersion);
      break;
    }

    if (isDiagramStateConflict(saveRes)) {
      const serverVersion = extractServerVersionFromError(saveRes);
      updateLastServerVersion(options.lastServerDiagramStateVersionRef, serverVersion);
      // Surface conflicts to the caller immediately. The UI shows a conflict
      // modal and lets the user choose reload/stay/discard instead of silently
      // rebasing and overwriting concurrent changes.
      break;
    }

    if (isLockFailure(saveRes)) {
      if (attempt >= maxAttempts) break;
      await sleep(500);
      continue;
    }

    break;
  }

  if (!saveRes?.ok) {
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
            updateLastServerVersion(options.lastServerDiagramStateVersionRef, pickDiagramStateBaseVersion(fresh.session));
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
        updateLastServerVersion(options.lastServerDiagramStateVersionRef, pickDiagramStateBaseVersion(fresh.session));
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
