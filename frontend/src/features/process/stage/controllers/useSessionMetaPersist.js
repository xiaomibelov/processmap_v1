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
  normalizeHybridLayerMap,
  serializeHybridLayerMap,
  normalizeHybridV2Doc,
  docToComparableJson,
}) {
  const persistHybridLayerMap = useCallback(async (nextRaw, options = {}) => {
    const nextMap = normalizeHybridLayerMap(nextRaw);
    const nextSig = serializeHybridLayerMap(nextMap);
    const prevMap = normalizeHybridLayerMap(hybridLayerPersistedMapRef.current);
    const prevSig = serializeHybridLayerMap(prevMap);
    if (nextSig === prevSig) return { ok: true, skipped: true };

    const currentMeta = asObject(draftBpmnMeta);
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
      const rollbackMeta = { ...currentMeta };
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
      return { ok: false, error: msg };
    }
    if (syncRes.session && typeof syncRes.session === "object") {
      onSessionSync?.({
        ...syncRes.session,
        _sync_source: "hybrid_layer_ui_save_session_patch",
      });
    }
    return { ok: true };
  }, [
    normalizeHybridLayerMap,
    serializeHybridLayerMap,
    hybridLayerPersistedMapRef,
    draftBpmnMeta,
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

    const currentMeta = asObject(draftBpmnMeta);
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
      const rollbackMeta = { ...currentMeta, hybrid_v2: prevDoc };
      onSessionSync?.({
        id: sid,
        session_id: sid,
        bpmn_meta: rollbackMeta,
        _sync_source: "hybrid_v2_save_rollback",
      });
      const msg = shortErr(syncRes?.error || "Не удалось сохранить Hybrid v2.");
      setGenErr(msg);
      return { ok: false, error: msg };
    }
    if (syncRes.session && typeof syncRes.session === "object") {
      onSessionSync?.({
        ...syncRes.session,
        _sync_source: "hybrid_v2_save_session_patch",
      });
    }
    return { ok: true };
  }, [
    normalizeHybridV2Doc,
    docToComparableJson,
    hybridV2PersistedDocRef,
    draftBpmnMeta,
    sid,
    onSessionSync,
    isLocal,
    shortErr,
    setGenErr,
  ]);

  return {
    persistHybridLayerMap,
    persistHybridV2Doc,
  };
}
