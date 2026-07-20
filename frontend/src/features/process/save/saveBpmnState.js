import { isLocalSessionId } from "../../../components/process/interview/utils.js";
import { normalizeCamundaExtensionsMap } from "../camunda/camundaExtensions.js";
import { getVersion as getTrackedDiagramStateVersion } from "../../../lib/casVersionTracker.js";
import { saveCoordinator } from "../../session/saveCoordinator.js";
import {
  asObject,
  buildFallbackSessionPatch,
  derivePropertySourceAction,
  extractServerVersionFromError,
  isDiagramStateConflict,
  isLockFailure,
  pickDiagramStateBaseVersion,
  pickDiagramStateVersion,
  pickServerCurrentVersionFromError,
  rememberDiagramStateVersion,
  resolveBaseDiagramStateVersion,
  toNonNegativeIntOrNull,
  toText,
} from "./saveBpmnState.helpers.js";

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

saveCoordinator.registerPipeline(XML_PIPELINE_NAME, {
  transport: async (sessionId, payload, signal) => {
    const useFlushSave = payload?.useFlushSave === true && typeof payload.flushSave === "function";
    if (useFlushSave) {
      return payload.flushSave(payload.sourceAction, {
        xmlOverride: payload.xml,
        baseDiagramStateVersion: payload.baseDiagramStateVersion,
        sourceAction: payload.sourceAction,
        bpmnMeta: payload.bpmnMeta,
        signal,
      });
    }
    if (typeof payload.apiPutBpmnXml === "function") {
      return payload.apiPutBpmnXml(sessionId, payload.xml, {
        sourceAction: payload.sourceAction,
        baseDiagramStateVersion: payload.baseDiagramStateVersion,
        bpmnMeta: payload.bpmnMeta,
        signal,
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
    // CAS bump is handled by saveCoordinator._runPipeline (single source of truth).
    // Only sync the version to external React state here.
    const version = pickDiagramStateVersion(response);
    if (version !== null) {
      try {
        payload?.rememberDiagramStateVersion?.(version, { sessionId });
      } catch {
        // no-op
      }
    }
  },
  on409: (response, sessionId, payload) => {
    // CAS rollback + setVersion is handled by saveCoordinator._runPipeline.
    // Only sync the server version to external React state here.
    const serverVersion = pickServerCurrentVersionFromError(response);
    if (serverVersion !== null) {
      try {
        payload?.rememberDiagramStateVersion?.(serverVersion, { sessionId });
      } catch {
        // no-op
      }
    }
  },
  onError: () => {
    // CAS rollback is handled by saveCoordinator._runPipeline.
  },
  debounceMs: 0,
  retryCount: 3,
  retryDelayMs: 1000,
  transportTimeoutMs: 10000,
  maxRetryDelayMs: 4000,
});

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
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
