import { useCallback } from "react";

import { apiPatchBpmnMeta } from "../../../../lib/api";
import { pushDeleteTrace } from "../utils/deleteTrace";
import useSessionMetaWriteGateway from "../../../session-meta/write/useSessionMetaWriteGateway";
import {
  buildSessionMetaSnapshot,
  buildSessionMetaWriteEnvelope,
} from "../../../session-meta/write/sessionMetaMergePolicy";
import {
  normalizeSessionCompanion,
  serializeSessionCompanion,
} from "../../session-companion/sessionCompanionContracts.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeSessionMetaBoundary(valueRaw, {
  normalizeHybridLayerMap,
  normalizeHybridV2Doc,
  normalizeDrawioMeta,
}) {
  const value = asObject(valueRaw);
  const hybridLayerMap = normalizeHybridLayerMap(value.hybrid_layer_by_element_id);
  const out = {
    ...value,
    version: Number(value.version) > 0 ? Number(value.version) : 1,
    hybrid_layer_by_element_id: hybridLayerMap,
    hybrid_v2: normalizeHybridV2Doc(value.hybrid_v2),
    drawio: normalizeDrawioMeta(value.drawio),
    auto_pass_v1: asObject(value.auto_pass_v1),
    session_companion_v1: normalizeSessionCompanion(value.session_companion_v1),
  };
  if (!Object.keys(hybridLayerMap).length) {
    delete out.hybrid_layer_by_element_id;
  }
  return out;
}

export default function useSessionMetaPersist({
  sid,
  isLocal,
  draftBpmnMeta,
  onSessionSync,
  setGenErr,
  shortErr,
  hybridLayerPersistedMapRef,
  hybridV2PersistedDocRef,
  drawioPersistedMetaRef,
  normalizeHybridLayerMap,
  serializeHybridLayerMap,
  normalizeHybridV2Doc,
  docToComparableJson,
  normalizeDrawioMeta,
  serializeDrawioMeta,
  drawioJazzAdapter = null,
  drawioLocalFirstAdapterMode = "legacy",
  sessionCompanionJazzAdapter = null,
  sessionCompanionLocalFirstAdapterMode = "legacy",
}) {
  const normalizeBoundaryMeta = useCallback((valueRaw) => normalizeSessionMetaBoundary(valueRaw, {
    normalizeHybridLayerMap,
    normalizeHybridV2Doc,
    normalizeDrawioMeta,
  }), [
    normalizeDrawioMeta,
    normalizeHybridLayerMap,
    normalizeHybridV2Doc,
  ]);

  const serializeBoundaryMeta = useCallback((valueRaw) => JSON.stringify(normalizeBoundaryMeta(valueRaw)), [normalizeBoundaryMeta]);

  const buildMetaSnapshot = useCallback(() => buildSessionMetaSnapshot({
    currentMetaRaw: draftBpmnMeta,
    persistedHybridLayerMapRaw: hybridLayerPersistedMapRef.current,
    persistedHybridV2DocRaw: hybridV2PersistedDocRef.current,
    persistedDrawioMetaRaw: drawioPersistedMetaRef.current,
    normalizeHybridLayerMap,
    normalizeHybridV2Doc,
    normalizeDrawioMeta,
  }), [
    draftBpmnMeta,
    drawioPersistedMetaRef,
    hybridLayerPersistedMapRef,
    hybridV2PersistedDocRef,
    normalizeDrawioMeta,
    normalizeHybridLayerMap,
    normalizeHybridV2Doc,
  ]);

  const writeGateway = useSessionMetaWriteGateway({
    sid,
    isLocal,
    normalizeMeta: normalizeBoundaryMeta,
    serializeMeta: serializeBoundaryMeta,
    getPersistedMeta: buildMetaSnapshot,
    onSessionSync,
    shortErr,
    setGenErr,
  });

  const syncPersistedRefs = useCallback((metaRaw) => {
    const meta = normalizeBoundaryMeta(metaRaw);
    hybridLayerPersistedMapRef.current = normalizeHybridLayerMap(meta.hybrid_layer_by_element_id);
    hybridV2PersistedDocRef.current = normalizeHybridV2Doc(meta.hybrid_v2);
    drawioPersistedMetaRef.current = normalizeDrawioMeta(meta.drawio);
  }, [
    drawioPersistedMetaRef,
    hybridLayerPersistedMapRef,
    hybridV2PersistedDocRef,
    normalizeBoundaryMeta,
    normalizeDrawioMeta,
    normalizeHybridLayerMap,
    normalizeHybridV2Doc,
  ]);

  const persistBpmnMeta = useCallback(async (nextRaw, options = {}) => {
    const source = String(options?.source || "bpmn_meta_save");
    const result = await writeGateway.persistSessionMeta(nextRaw, {
      source,
      remoteWrite: typeof options?.remoteWrite === "function" ? options.remoteWrite : undefined,
      onOptimistic: ({ nextMeta }) => {
        syncPersistedRefs(nextMeta);
      },
      onRollback: ({ prevMeta, writeSeq }) => {
        syncPersistedRefs(prevMeta);
        onSessionSync?.(buildSessionMetaWriteEnvelope({
          sessionId: sid,
          bpmnMeta: prevMeta,
          source: `${source}_rollback`,
          writeSeq,
        }));
      },
    });
    return result;
  }, [onSessionSync, sid, syncPersistedRefs, writeGateway]);

  const persistHybridLayerMap = useCallback(async (nextRaw, options = {}) => {
    const nextMap = normalizeHybridLayerMap(nextRaw);
    const nextSig = serializeHybridLayerMap(nextMap);
    const prevMap = normalizeHybridLayerMap(hybridLayerPersistedMapRef.current);
    const prevSig = serializeHybridLayerMap(prevMap);
    if (nextSig === prevSig) return { ok: true, skipped: true };
    const nextMeta = {
      ...buildMetaSnapshot(),
      hybrid_layer_by_element_id: nextMap,
    };
    if (!Object.keys(nextMap).length) {
      delete nextMeta.hybrid_layer_by_element_id;
    }
    return persistBpmnMeta(nextMeta, {
      source: String(options?.source || "hybrid_layer_ui_save"),
    });
  }, [
    buildMetaSnapshot,
    hybridLayerPersistedMapRef,
    normalizeHybridLayerMap,
    persistBpmnMeta,
    serializeHybridLayerMap,
  ]);

  const persistHybridV2Doc = useCallback(async (nextRaw, options = {}) => {
    const nextDoc = normalizeHybridV2Doc(nextRaw);
    const nextSig = docToComparableJson(nextDoc);
    const prevDoc = normalizeHybridV2Doc(hybridV2PersistedDocRef.current);
    const prevSig = docToComparableJson(prevDoc);
    if (nextSig === prevSig) return { ok: true, skipped: true };
    const nextMeta = {
      ...buildMetaSnapshot(),
      hybrid_v2: nextDoc,
    };
    return persistBpmnMeta(nextMeta, {
      source: String(options?.source || "hybrid_v2_save"),
    });
  }, [
    buildMetaSnapshot,
    docToComparableJson,
    hybridV2PersistedDocRef,
    normalizeHybridV2Doc,
    persistBpmnMeta,
  ]);

  const persistDrawioMeta = useCallback(async (nextRaw, options = {}) => {
    const source = String(options?.source || "drawio_save");
    const nextMeta = normalizeDrawioMeta(nextRaw);
    if (!nextMeta.last_saved_at) {
      nextMeta.last_saved_at = new Date().toISOString();
    }
    const nextSig = serializeDrawioMeta(nextMeta);
    const legacyPrevMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const legacyPrevSig = serializeDrawioMeta(legacyPrevMeta);
    const jazzPrevMeta = (
      drawioLocalFirstAdapterMode === "jazz" && drawioJazzAdapter
        ? normalizeDrawioMeta(drawioJazzAdapter.readSharedSnapshot())
        : normalizeDrawioMeta({})
    );
    const jazzPrevSig = serializeDrawioMeta(jazzPrevMeta);
    const needsLegacyWrite = nextSig !== legacyPrevSig;
    const needsJazzWrite = drawioLocalFirstAdapterMode === "jazz" && !!drawioJazzAdapter && nextSig !== jazzPrevSig;
    if (!needsLegacyWrite && !needsJazzWrite) {
      pushDeleteTrace("persist_drawio_meta_skipped", {
        source,
        reason: "same_signature",
      });
      return { ok: true, skipped: true };
    }
    pushDeleteTrace("persist_drawio_meta_optimistic", {
      source,
      svgCacheLength: Number(String(nextMeta?.svg_cache || "").length || 0),
      elementsCount: Number(Array.isArray(nextMeta?.drawio_elements_v1) ? nextMeta.drawio_elements_v1.length : 0),
      deletedCount: Number(
        Array.isArray(nextMeta?.drawio_elements_v1)
          ? nextMeta.drawio_elements_v1.filter((row) => row && typeof row === "object" && row.deleted === true).length
          : 0,
      ),
    });
    let legacyResult = { ok: true, skipped: true };
    if (needsLegacyWrite) {
      const useVisibilityPatchPath = source === "drawio_visibility_toggle" && !isLocal && !!sid;
      if (useVisibilityPatchPath) {
        const mergedMeta = {
          ...buildMetaSnapshot(),
          drawio: nextMeta,
        };
        legacyResult = await persistBpmnMeta(mergedMeta, {
          source,
          remoteWrite: async ({ sid: writeSid, nextMeta: writeMeta }) => {
            const drawioMeta = normalizeDrawioMeta(asObject(asObject(writeMeta).drawio));
            const patchRes = await apiPatchBpmnMeta(writeSid, { drawio: drawioMeta });
            if (!patchRes?.ok) return patchRes;
            return {
              ok: true,
              status: Number(patchRes?.status || 0),
              meta: normalizeBoundaryMeta(patchRes?.meta),
              transport: "bpmn_meta_patch",
            };
          },
        });
        if (!legacyResult?.ok) {
          pushDeleteTrace("persist_drawio_meta_failed", {
            source,
            status: Number(legacyResult?.status || 0),
            boundary: "legacy_bpmn_meta_patch",
          });
          return legacyResult;
        }
      } else {
        const mergedMeta = {
          ...buildMetaSnapshot(),
          drawio: nextMeta,
        };
        legacyResult = await persistBpmnMeta(mergedMeta, { source });
        if (!legacyResult?.ok) {
          pushDeleteTrace("persist_drawio_meta_failed", {
            source,
            status: Number(legacyResult?.status || 0),
            boundary: "legacy_session_meta",
          });
          return legacyResult;
        }
      }
    }
    let jazzResult = { ok: true, skipped: true };
    if (needsJazzWrite) {
      jazzResult = await drawioJazzAdapter.applySnapshot({ snapshot: nextMeta });
      if (!jazzResult?.ok) {
        pushDeleteTrace("persist_drawio_meta_failed", {
          source,
          status: 0,
          boundary: "drawio_jazz",
          blocked: String(jazzResult?.blocked || ""),
        });
        return {
          ok: false,
          error: String(jazzResult?.error || "Не удалось сохранить Draw.io overlay в Jazz."),
          blocked: jazzResult?.blocked || "runtime_error",
          status: 0,
        };
      }
    }
    pushDeleteTrace("persist_drawio_meta_synced", {
      source,
      bridge: needsJazzWrite ? "legacy_plus_jazz" : "legacy_only",
    });
    return {
      ok: true,
      legacy: legacyResult,
      jazz: jazzResult,
      bridge: needsJazzWrite ? "legacy_plus_jazz" : "legacy_only",
    };
  }, [
    buildMetaSnapshot,
    drawioJazzAdapter,
    drawioLocalFirstAdapterMode,
    drawioPersistedMetaRef,
    isLocal,
    normalizeDrawioMeta,
    persistBpmnMeta,
    serializeDrawioMeta,
    sid,
  ]);

  const persistSessionCompanion = useCallback(async (nextRaw, options = {}) => {
    const nextCompanion = normalizeSessionCompanion(nextRaw);
    const nextSig = serializeSessionCompanion(nextCompanion);
    const legacyPrevCompanion = normalizeSessionCompanion(asObject(asObject(draftBpmnMeta).session_companion_v1));
    const legacyPrevSig = serializeSessionCompanion(legacyPrevCompanion);
    const jazzPrevCompanion = (
      sessionCompanionLocalFirstAdapterMode === "jazz" && sessionCompanionJazzAdapter
        ? normalizeSessionCompanion(sessionCompanionJazzAdapter.readSharedSnapshot())
        : normalizeSessionCompanion({})
    );
    const jazzPrevSig = serializeSessionCompanion(jazzPrevCompanion);
    const needsLegacyWrite = nextSig !== legacyPrevSig;
    const needsJazzWrite = (
      sessionCompanionLocalFirstAdapterMode === "jazz"
      && !!sessionCompanionJazzAdapter
      && nextSig !== jazzPrevSig
    );
    if (!needsLegacyWrite && !needsJazzWrite) {
      return { ok: true, skipped: true };
    }
    let legacyResult = { ok: true, skipped: true };
    if (needsLegacyWrite) {
      const mergedMeta = {
        ...buildMetaSnapshot(),
        session_companion_v1: nextCompanion,
      };
      legacyResult = await persistBpmnMeta(mergedMeta, {
        source: String(options?.source || "session_companion_save"),
      });
      if (!legacyResult?.ok) return legacyResult;
    }
    let jazzResult = { ok: true, skipped: true };
    if (needsJazzWrite) {
      jazzResult = await sessionCompanionJazzAdapter.applySnapshot({ snapshot: nextCompanion });
      if (!jazzResult?.ok) {
        return {
          ok: false,
          error: String(jazzResult?.error || "Не удалось сохранить session companion в Jazz."),
          blocked: jazzResult?.blocked || "runtime_error",
          status: 0,
        };
      }
    }
    return {
      ok: true,
      legacy: legacyResult,
      jazz: jazzResult,
      bridge: needsJazzWrite ? "legacy_plus_jazz" : "legacy_only",
    };
  }, [
    buildMetaSnapshot,
    draftBpmnMeta,
    persistBpmnMeta,
    sessionCompanionJazzAdapter,
    sessionCompanionLocalFirstAdapterMode,
  ]);

  return {
    persistBpmnMeta,
    persistHybridLayerMap,
    persistHybridV2Doc,
    persistDrawioMeta,
    persistSessionCompanion,
  };
}
