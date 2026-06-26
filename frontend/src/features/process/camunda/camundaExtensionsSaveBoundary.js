import { finalizeCamundaExtensionsXml, normalizeCamundaExtensionsMap } from "./camundaExtensions.js";

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

function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
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

function pickDiagramStateBaseVersion(sessionLike) {
  const raw = sessionLike && typeof sessionLike === "object"
    ? sessionLike.diagram_state_version ?? sessionLike.bpmn_xml_version ?? sessionLike.version
    : null;
  return toNonNegativeIntOrNull(raw);
}

function extractServerVersionFromError(saveResult) {
  const detail = saveResult?.data?.detail;
  if (detail && typeof detail === "object") {
    const v = Number(detail.server_current_version ?? detail.serverCurrentVersion ?? -1);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

function logCamundaExtSave(payload) {
  const parts = Object.entries(payload).map(([k, v]) => `${k}=${v}`);
  // eslint-disable-next-line no-console
  console.log(`[CAMUNDA-EXT-SAVE] ${parts.join(" ")}`);
}

function buildRetryMeta({
  latestMetaRaw,
  previousMetaRaw,
  nextCamundaExtensionsByElementId,
}) {
  const latestMeta = asObject(latestMetaRaw);
  const previousMeta = asObject(previousMetaRaw);
  return {
    ...previousMeta,
    ...latestMeta,
    camunda_extensions_by_element_id: nextCamundaExtensionsByElementId,
  };
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

export function buildCamundaExtensionsCanonicalXml({
  currentXmlRaw,
  nextCamundaExtensionsByElementIdRaw,
  buildCanonicalXml,
}) {
  const currentXml = toText(currentXmlRaw);
  const nextCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(nextCamundaExtensionsByElementIdRaw);
  const buildXml = typeof buildCanonicalXml === "function"
    ? buildCanonicalXml
    : ({ xmlText, camundaExtensionsByElementId }) => finalizeCamundaExtensionsXml({
      xmlText,
      camundaExtensionsByElementId,
    });
  const nextXml = buildXml({
    xmlText: currentXml,
    camundaExtensionsByElementId: nextCamundaExtensionsByElementId,
  });
  return {
    currentXml,
    nextXml: String(nextXml || ""),
    nextCamundaExtensionsByElementId,
  };
}

export async function persistCamundaExtensionsViaCanonicalXmlBoundary({
  sessionIdRaw,
  isLocal,
  currentXmlRaw,
  currentMetaRaw,
  nextMetaRaw,
  nextCamundaExtensionsByElementIdRaw,
  baseDiagramStateVersionRaw,
  lastServerDiagramStateVersionRef,
  buildCanonicalXml,
  apiPutBpmnXml,
  apiPatchSessionMeta,
  apiPatchSessionProperties,
  apiGetSession,
  onSessionSync,
  forceMetaPatch = false,
  backgroundSessionRefresh = false,
  onDurableSaveAck,
  onBackgroundSessionSyncStart,
  onBackgroundSessionSyncComplete,
  onBackgroundSessionSyncError,
  syncSource = "camunda_extensions_xml_boundary_save",
}) {
  const sid = toText(sessionIdRaw);
  const nextMeta = asObject(nextMetaRaw);
  const currentMeta = asObject(currentMetaRaw);
  const {
    currentXml,
    nextXml,
    nextCamundaExtensionsByElementId,
  } = buildCamundaExtensionsCanonicalXml({
    currentXmlRaw,
    nextCamundaExtensionsByElementIdRaw,
    buildCanonicalXml,
  });

  const metaDiff = !deepEqual(nextMeta, currentMeta);

  if (!nextXml) {
    logCamundaExtSave({ status: "error", error: "empty_xml", metaDiff });
    return { ok: false, status: 0, error: "Пустая BPMN XML: не удалось применить Properties." };
  }

  let effectiveBaseVersion = toNonNegativeIntOrNull(baseDiagramStateVersionRaw);
  const getBaseVersion = () => toNonNegativeIntOrNull(
    lastServerDiagramStateVersionRef?.current ?? effectiveBaseVersion,
  );

  const updateLastServerVersion = (value) => {
    const v = toNonNegativeIntOrNull(value);
    if (v === null) return;
    if (lastServerDiagramStateVersionRef?.current !== undefined) {
      lastServerDiagramStateVersionRef.current = Math.max(lastServerDiagramStateVersionRef.current ?? 0, v);
    }
  };

  const shouldUseMetaPatch = forceMetaPatch || nextXml === currentXml;
  if (shouldUseMetaPatch) {
    if (!metaDiff && !forceMetaPatch) {
      logCamundaExtSave({ status: "skipped", xmlDiff: false, metaDiff: false });
      return { ok: true, skipped: true, local: false };
    }
    const patchApi = apiPatchSessionProperties || apiPatchSessionMeta;
    if (typeof patchApi === "function") {
      // Meta-only PATCH path: for property-only saves we do not touch BPMN XML.
      // With forceMetaPatch we still keep the locally-derived XML in the draft so
      // the canvas stays consistent until the next full BPMN save.
      const localXml = forceMetaPatch ? (nextXml || currentXml) : currentXml;
      let patchRes;
      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        attempt += 1;
        const baseVersion = getBaseVersion();
        logCamundaExtSave({ status: "meta_patch_attempt", attempt, baseVersion, serverVersion: lastServerDiagramStateVersionRef?.current ?? null, forceMetaPatch });
        patchRes = await patchApi(sid, {
          bpmn_meta_json: nextMeta,
          base_diagram_state_version: baseVersion,
        });
        if (patchRes?.ok) {
          const serverVersion = Number(patchRes?.session?.diagram_state_version ?? patchRes?.data?.diagram_state_version ?? -1);
          updateLastServerVersion(serverVersion);
          logCamundaExtSave({ status: "meta_patch_saved", baseVersion, serverVersion, xmlDiff: false, metaDiff: true, forceMetaPatch });
          const ack = {
            ok: true,
            status: Number(patchRes?.status || 200),
            storedRev: Number(patchRes?.session?.bpmn_xml_version ?? patchRes?.data?.rev ?? 0),
            diagramStateVersion: serverVersion,
            nextXml: localXml,
            nextMeta,
            nextCamundaExtensionsByElementId,
            backgroundSessionRefresh: false,
          };
          onDurableSaveAck?.(ack);
          onSessionSync?.(buildFallbackSessionPatch({
            sid,
            nextXml: localXml,
            nextMeta,
            storedRev: ack.storedRev,
            diagramStateVersion: ack.diagramStateVersion,
            syncSource,
          }));
          return ack;
        }
        if (isDiagramStateConflict(patchRes)) {
          const serverVersion = extractServerVersionFromError(patchRes);
          updateLastServerVersion(serverVersion);
          if (attempt >= maxAttempts) break;
          if (typeof apiGetSession === "function") {
            const latest = await apiGetSession(sid);
            if (latest?.ok && latest.session) {
              const latestVersion = pickDiagramStateBaseVersion(latest.session);
              updateLastServerVersion(latestVersion);
              if (latestVersion !== null) {
                effectiveBaseVersion = latestVersion;
              }
            }
          }
          await sleep(100 * (2 ** (attempt - 1)));
          continue;
        }
        if (isLockFailure(patchRes)) {
          if (attempt >= maxAttempts) break;
          await sleep(500);
          continue;
        }
        break;
      }
      logCamundaExtSave({ status: "meta_patch_error", error: patchRes?.error || "unknown", xmlDiff: false, metaDiff: true });
      return {
        ok: false,
        status: Number(patchRes?.status || 0),
        error: String(patchRes?.error || "Не удалось сохранить Properties."),
      };
    }
    logCamundaExtSave({ status: "error", error: "xml_unchanged_no_meta_endpoint", xmlDiff: false, metaDiff: true });
    return { ok: false, status: 0, error: "Изменения Properties не применились к BPMN XML." };
  }

  if (!sid || isLocal) {
    if (typeof onSessionSync === "function" && sid) {
      onSessionSync({
        ...buildFallbackSessionPatch({
          sid,
          nextXml,
          nextMeta,
          storedRev: toNonNegativeIntOrNull(baseDiagramStateVersionRaw),
          diagramStateVersion: toNonNegativeIntOrNull(baseDiagramStateVersionRaw),
          syncSource,
        }),
      });
    }
    logCamundaExtSave({ status: "local", xmlDiff: true, metaDiff });
    return {
      ok: true,
      local: true,
      nextXml,
      nextMeta,
      nextCamundaExtensionsByElementId,
    };
  }

  if (typeof apiPutBpmnXml !== "function") {
    return { ok: false, status: 0, error: "apiPutBpmnXml unavailable" };
  }

  let persistedXml = nextXml;
  let persistedMeta = nextMeta;
  let saveRes = null;
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt += 1;
    const baseVersion = getBaseVersion();
    logCamundaExtSave({ status: "put_attempt", attempt, baseVersion, serverVersion: lastServerDiagramStateVersionRef?.current ?? null, xmlDiff: true, metaDiff });
    saveRes = await apiPutBpmnXml(sid, persistedXml, {
      reason: "manual_save:camunda_extensions",
      baseDiagramStateVersion: baseVersion,
      bpmnMeta: persistedMeta,
    });

    if (saveRes?.ok) {
      updateLastServerVersion(saveRes.diagramStateVersion);
      break;
    }

    if (isDiagramStateConflict(saveRes)) {
      const serverVersion = extractServerVersionFromError(saveRes);
      updateLastServerVersion(serverVersion);
      if (attempt >= maxAttempts) break;
      if (typeof apiGetSession === "function") {
        const latest = await apiGetSession(sid);
        if (latest?.ok && latest.session && typeof latest.session === "object") {
          const retryMeta = buildRetryMeta({
            latestMetaRaw: latest.session?.bpmn_meta,
            previousMetaRaw: persistedMeta,
            nextCamundaExtensionsByElementId,
          });
          const rebased = buildCamundaExtensionsCanonicalXml({
            currentXmlRaw: latest.session?.bpmn_xml,
            nextCamundaExtensionsByElementIdRaw: nextCamundaExtensionsByElementId,
            buildCanonicalXml,
          });
          if (rebased.nextXml && rebased.nextXml !== rebased.currentXml) {
            const retryBaseVersion = pickDiagramStateBaseVersion(latest.session);
            updateLastServerVersion(retryBaseVersion);
            if (retryBaseVersion !== null) {
              effectiveBaseVersion = retryBaseVersion;
            }
            persistedXml = rebased.nextXml;
            persistedMeta = retryMeta;
            await sleep(100 * (2 ** (attempt - 1)));
            continue;
          }
          // XML became identical after rebase — fall through to meta-only path on next iteration? Simpler: break and let caller handle.
          saveRes = { ok: false, status: 409, error: "DIAGRAM_STATE_CONFLICT" };
          break;
        }
      }
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
    logCamundaExtSave({ status: "error", error: saveRes?.error || "unknown", xmlDiff: true, metaDiff, baseVersion: getBaseVersion() });
    return {
      ok: false,
      status: Number(saveRes?.status || 0),
      error: String(saveRes?.error || "Не удалось сохранить Properties."),
    };
  }

  logCamundaExtSave({ status: "saved", baseVersion: getBaseVersion(), serverVersion: saveRes.diagramStateVersion, xmlDiff: true, metaDiff });

  const durableAckPayload = {
    ok: true,
    status: Number(saveRes?.status || 200),
    storedRev: Number(saveRes?.storedRev || 0),
    diagramStateVersion: Number(saveRes?.diagramStateVersion || 0),
    nextXml: persistedXml,
    nextMeta: persistedMeta,
    nextCamundaExtensionsByElementId,
  };
  if (saveRes?.bpmnVersionSnapshot) {
    durableAckPayload.bpmnVersionSnapshot = saveRes.bpmnVersionSnapshot;
  }
  onDurableSaveAck?.(durableAckPayload);

  const fallbackPatch = buildFallbackSessionPatch({
    sid,
    nextXml: persistedXml,
    nextMeta: persistedMeta,
    storedRev: Number(saveRes?.storedRev || 0),
    diagramStateVersion: Number(saveRes?.diagramStateVersion || 0),
    syncSource,
  });

  if (backgroundSessionRefresh) {
    onSessionSync?.(fallbackPatch);
    let backgroundSessionSyncPromise = null;
    if (typeof apiGetSession === "function") {
      onBackgroundSessionSyncStart?.(durableAckPayload);
      backgroundSessionSyncPromise = (async () => {
        try {
          const fresh = await apiGetSession(sid);
          if (fresh?.ok && fresh.session && typeof fresh.session === "object") {
            updateLastServerVersion(pickDiagramStateBaseVersion(fresh.session));
            const syncPayload = {
              ...fresh.session,
              _sync_source: syncSource,
            };
            onSessionSync?.(syncPayload);
            onBackgroundSessionSyncComplete?.({ ok: true, session: syncPayload, durableAck: durableAckPayload });
            return { ok: true, session: syncPayload };
          }
          const errorPayload = {
            ok: false,
            status: Number(fresh?.status || 0),
            error: String(fresh?.error || "session_refresh_failed"),
            durableAck: durableAckPayload,
          };
          onBackgroundSessionSyncError?.(errorPayload);
          return errorPayload;
        } catch (error) {
          const errorPayload = {
            ok: false,
            status: 0,
            error: String(error?.message || error || "session_refresh_failed"),
            durableAck: durableAckPayload,
          };
          onBackgroundSessionSyncError?.(errorPayload);
          return errorPayload;
        }
      })();
    }
    return {
      ...durableAckPayload,
      backgroundSessionRefresh: typeof apiGetSession === "function",
      backgroundSessionSyncPromise,
    };
  }

  let sessionSynced = false;
  if (typeof apiGetSession === "function") {
    const fresh = await apiGetSession(sid);
    if (fresh?.ok && fresh.session && typeof fresh.session === "object") {
      updateLastServerVersion(pickDiagramStateBaseVersion(fresh.session));
      onSessionSync?.({
        ...fresh.session,
        _sync_source: syncSource,
      });
      sessionSynced = true;
    }
  }
  if (!sessionSynced) {
    onSessionSync?.(fallbackPatch);
  }

  return durableAckPayload;
}
