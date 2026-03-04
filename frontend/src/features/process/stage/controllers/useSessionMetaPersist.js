import { useCallback } from "react";
import { apiPatchSession } from "../../../../lib/api/sessionApi";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
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
  const buildMetaSnapshot = useCallback(() => {
    const currentMeta = asObject(draftBpmnMeta);
    const hybridLayerMap = normalizeHybridLayerMap(
      Object.keys(asObject(hybridLayerPersistedMapRef.current)).length
        ? hybridLayerPersistedMapRef.current
        : currentMeta.hybrid_layer_by_element_id,
    );
    const hybridV2Doc = normalizeHybridV2Doc(
      asObject(hybridV2PersistedDocRef.current).schema_version
        ? hybridV2PersistedDocRef.current
        : currentMeta.hybrid_v2,
    );
    const drawioMeta = normalizeDrawioMeta(
      asObject(drawioPersistedMetaRef.current).doc_xml
        || asObject(drawioPersistedMetaRef.current).svg_cache
        || drawioPersistedMetaRef.current?.enabled
        ? drawioPersistedMetaRef.current
        : currentMeta.drawio,
    );
    const meta = { ...currentMeta, hybrid_layer_by_element_id: hybridLayerMap, hybrid_v2: hybridV2Doc, drawio: drawioMeta };
    if (!Object.keys(hybridLayerMap).length) {
      delete meta.hybrid_layer_by_element_id;
    }
    return meta;
  }, [
    draftBpmnMeta,
    hybridLayerPersistedMapRef,
    hybridV2PersistedDocRef,
    drawioPersistedMetaRef,
    normalizeHybridLayerMap,
    normalizeHybridV2Doc,
    normalizeDrawioMeta,
  ]);

  const persistHybridLayerMap = useCallback(async (nextRaw, options = {}) => {
    const nextMap = normalizeHybridLayerMap(nextRaw);
    const nextSig = serializeHybridLayerMap(nextMap);
    const prevMap = normalizeHybridLayerMap(hybridLayerPersistedMapRef.current);
    const prevSig = serializeHybridLayerMap(prevMap);
    if (nextSig === prevSig) return { ok: true, skipped: true };

    const currentMeta = buildMetaSnapshot();
    const optimisticMeta = { ...currentMeta };
    if (Object.keys(nextMap).length) optimisticMeta.hybrid_layer_by_element_id = nextMap;
    else delete optimisticMeta.hybrid_layer_by_element_id;

    const optimisticSession = {
      id: sid,
      session_id: sid,
      bpmn_meta: optimisticMeta,
      _sync_source: String(options?.source || "hybrid_layer_ui_save"),
    };
    hybridLayerPersistedMapRef.current = nextMap;
    onSessionSync?.(optimisticSession);

    if (!sid || isLocal) return { ok: true, local: true };

    const syncRes = await apiPatchSession(sid, { bpmn_meta: optimisticMeta });
    if (!syncRes?.ok) {
      hybridLayerPersistedMapRef.current = prevMap;
      const rollbackMeta = { ...buildMetaSnapshot() };
      if (Object.keys(prevMap).length) rollbackMeta.hybrid_layer_by_element_id = prevMap;
      else delete rollbackMeta.hybrid_layer_by_element_id;
      onSessionSync?.({
        id: sid,
        session_id: sid,
        bpmn_meta: rollbackMeta,
        _sync_source: "hybrid_layer_ui_save_rollback",
      });
      const msg = shortErr(syncRes?.error || "Не удалось сохранить Hybrid Layer.");
      setGenErr(msg);
      return { ok: false, error: msg, status: Number(syncRes?.status || 0) };
    }
    if (syncRes.session && typeof syncRes.session === "object") {
      onSessionSync?.({
        ...syncRes.session,
        _sync_source: "hybrid_layer_ui_save_session_patch",
      });
    }
    return { ok: true };
  }, [
    buildMetaSnapshot,
    normalizeHybridLayerMap,
    serializeHybridLayerMap,
    hybridLayerPersistedMapRef,
    sid,
    onSessionSync,
    isLocal,
    shortErr,
    setGenErr,
  ]);

  const persistHybridV2Doc = useCallback(async (nextRaw, options = {}) => {
    const nextDoc = normalizeHybridV2Doc(nextRaw);
    const nextSig = docToComparableJson(nextDoc);
    const prevDoc = normalizeHybridV2Doc(hybridV2PersistedDocRef.current);
    const prevSig = docToComparableJson(prevDoc);
    if (nextSig === prevSig) return { ok: true, skipped: true };

    const currentMeta = buildMetaSnapshot();
    const optimisticMeta = { ...currentMeta, hybrid_v2: nextDoc };
    const optimisticSession = {
      id: sid,
      session_id: sid,
      bpmn_meta: optimisticMeta,
      _sync_source: String(options?.source || "hybrid_v2_save"),
    };
    hybridV2PersistedDocRef.current = nextDoc;
    onSessionSync?.(optimisticSession);
    if (!sid || isLocal) return { ok: true, local: true };

    const syncRes = await apiPatchSession(sid, { bpmn_meta: optimisticMeta });
    if (!syncRes?.ok) {
      hybridV2PersistedDocRef.current = prevDoc;
      const rollbackMeta = { ...buildMetaSnapshot(), hybrid_v2: prevDoc };
      onSessionSync?.({
        id: sid,
        session_id: sid,
        bpmn_meta: rollbackMeta,
        _sync_source: "hybrid_v2_save_rollback",
      });
      const msg = shortErr(syncRes?.error || "Не удалось сохранить Hybrid v2.");
      setGenErr(msg);
      return { ok: false, error: msg, status: Number(syncRes?.status || 0) };
    }
    if (syncRes.session && typeof syncRes.session === "object") {
      onSessionSync?.({
        ...syncRes.session,
        _sync_source: "hybrid_v2_save_session_patch",
      });
    }
    return { ok: true };
  }, [
    buildMetaSnapshot,
    normalizeHybridV2Doc,
    docToComparableJson,
    hybridV2PersistedDocRef,
    sid,
    onSessionSync,
    isLocal,
    shortErr,
    setGenErr,
  ]);

  const persistDrawioMeta = useCallback(async (nextRaw, options = {}) => {
    const nextMeta = normalizeDrawioMeta(nextRaw);
    const nextSig = serializeDrawioMeta(nextMeta);
    const prevMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const prevSig = serializeDrawioMeta(prevMeta);
    if (nextSig === prevSig) return { ok: true, skipped: true };

    const currentMeta = buildMetaSnapshot();
    const optimisticMeta = { ...currentMeta, drawio: nextMeta };
    const optimisticSession = {
      id: sid,
      session_id: sid,
      bpmn_meta: optimisticMeta,
      _sync_source: String(options?.source || "drawio_save"),
    };
    drawioPersistedMetaRef.current = nextMeta;
    onSessionSync?.(optimisticSession);
    if (!sid || isLocal) return { ok: true, local: true };

    const syncRes = await apiPatchSession(sid, { bpmn_meta: optimisticMeta });
    if (!syncRes?.ok) {
      drawioPersistedMetaRef.current = prevMeta;
      const rollbackMeta = { ...buildMetaSnapshot(), drawio: prevMeta };
      onSessionSync?.({
        id: sid,
        session_id: sid,
        bpmn_meta: rollbackMeta,
        _sync_source: "drawio_save_rollback",
      });
      const msg = shortErr(syncRes?.error || "Не удалось сохранить Draw.io.");
      setGenErr(msg);
      return { ok: false, error: msg, status: Number(syncRes?.status || 0) };
    }
    if (syncRes.session && typeof syncRes.session === "object") {
      onSessionSync?.({
        ...syncRes.session,
        _sync_source: "drawio_save_session_patch",
      });
    }
    return { ok: true };
  }, [
    buildMetaSnapshot,
    normalizeDrawioMeta,
    serializeDrawioMeta,
    drawioPersistedMetaRef,
    sid,
    onSessionSync,
    isLocal,
    shortErr,
    setGenErr,
  ]);

  return {
    persistHybridLayerMap,
    persistHybridV2Doc,
    persistDrawioMeta,
  };
}
