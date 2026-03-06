import { useCallback } from "react";

import { pushDeleteTrace } from "../utils/deleteTrace";
import useSessionMetaWriteGateway from "../../../session-meta/write/useSessionMetaWriteGateway";
import {
  buildSessionMetaSnapshot,
  buildSessionMetaWriteEnvelope,
} from "../../../session-meta/write/sessionMetaMergePolicy";

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
    const nextMeta = normalizeDrawioMeta(nextRaw);
    const nextSig = serializeDrawioMeta(nextMeta);
    const prevMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const prevSig = serializeDrawioMeta(prevMeta);
    if (nextSig === prevSig) {
      pushDeleteTrace("persist_drawio_meta_skipped", {
        source: String(options?.source || "drawio_save"),
        reason: "same_signature",
      });
      return { ok: true, skipped: true };
    }
    pushDeleteTrace("persist_drawio_meta_optimistic", {
      source: String(options?.source || "drawio_save"),
      svgCacheLength: Number(String(nextMeta?.svg_cache || "").length || 0),
      elementsCount: Number(Array.isArray(nextMeta?.drawio_elements_v1) ? nextMeta.drawio_elements_v1.length : 0),
      deletedCount: Number(
        Array.isArray(nextMeta?.drawio_elements_v1)
          ? nextMeta.drawio_elements_v1.filter((row) => row && typeof row === "object" && row.deleted === true).length
          : 0,
      ),
    });
    const mergedMeta = {
      ...buildMetaSnapshot(),
      drawio: nextMeta,
    };
    const result = await persistBpmnMeta(mergedMeta, {
      source: String(options?.source || "drawio_save"),
    });
    if (!result?.ok) {
      pushDeleteTrace("persist_drawio_meta_failed", {
        source: String(options?.source || "drawio_save"),
        status: Number(result?.status || 0),
      });
      return result;
    }
    pushDeleteTrace("persist_drawio_meta_synced", {
      source: String(options?.source || "drawio_save"),
    });
    return result;
  }, [
    buildMetaSnapshot,
    drawioPersistedMetaRef,
    normalizeDrawioMeta,
    persistBpmnMeta,
    serializeDrawioMeta,
  ]);

  return {
    persistBpmnMeta,
    persistHybridLayerMap,
    persistHybridV2Doc,
    persistDrawioMeta,
  };
}
