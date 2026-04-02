function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function hasKeys(valueRaw) {
  return Object.keys(asObject(valueRaw)).length > 0;
}

export function buildSessionMetaSnapshot({
  currentMetaRaw,
  persistedHybridLayerMapRaw,
  persistedHybridV2DocRaw,
  persistedDrawioMetaRaw,
  normalizeHybridLayerMap,
  normalizeHybridV2Doc,
  normalizeDrawioMeta,
}) {
  const currentMeta = asObject(currentMetaRaw);
  const persistedHybridLayerMap = asObject(persistedHybridLayerMapRaw);
  const persistedHybridV2Doc = asObject(persistedHybridV2DocRaw);
  const persistedDrawioMeta = asObject(persistedDrawioMetaRaw);
  const hybridLayerMap = normalizeHybridLayerMap(
    hasKeys(persistedHybridLayerMap)
      ? persistedHybridLayerMap
      : currentMeta.hybrid_layer_by_element_id,
  );
  const hybridV2Doc = normalizeHybridV2Doc(
    persistedHybridV2Doc.schema_version
      ? persistedHybridV2Doc
      : currentMeta.hybrid_v2,
  );
  const drawioMeta = normalizeDrawioMeta(
    persistedDrawioMeta.doc_xml
      || persistedDrawioMeta.svg_cache
      || persistedDrawioMeta.enabled
      ? persistedDrawioMeta
      : currentMeta.drawio,
  );
  const meta = {
    ...currentMeta,
    hybrid_layer_by_element_id: hybridLayerMap,
    hybrid_v2: hybridV2Doc,
    drawio: drawioMeta,
  };
  if (!hasKeys(hybridLayerMap)) {
    delete meta.hybrid_layer_by_element_id;
  }
  return meta;
}

export function mergeSessionMetaForRead({
  sessionMetaRaw,
  localMetaRaw,
  normalizeBpmnMeta,
  normalizeHybridLayerMap,
  mergeHybridV2Doc,
  mergeDrawioMeta,
  preferServerOverlay = true,
}) {
  const sessionMeta = normalizeBpmnMeta(asObject(sessionMetaRaw));
  const localMeta = normalizeBpmnMeta(asObject(localMetaRaw));
  const serverHybridLayerByElementId = normalizeHybridLayerMap(sessionMeta.hybrid_layer_by_element_id);
  const localHybridLayerByElementId = normalizeHybridLayerMap(localMeta.hybrid_layer_by_element_id);
  const hybridLayerByElementId = preferServerOverlay
    ? (hasKeys(serverHybridLayerByElementId) ? serverHybridLayerByElementId : localHybridLayerByElementId)
    : {
      ...serverHybridLayerByElementId,
      ...localHybridLayerByElementId,
    };
  const nextRaw = {
    version: Number(sessionMeta.version) > 0 ? Number(sessionMeta.version) : 1,
    flow_meta: hasKeys(sessionMeta.flow_meta) ? sessionMeta.flow_meta : localMeta.flow_meta,
    node_path_meta: hasKeys(sessionMeta.node_path_meta) ? sessionMeta.node_path_meta : localMeta.node_path_meta,
    robot_meta_by_element_id: hasKeys(sessionMeta.robot_meta_by_element_id)
      ? sessionMeta.robot_meta_by_element_id
      : localMeta.robot_meta_by_element_id,
    camunda_extensions_by_element_id: sessionMeta.camunda_extensions_by_element_id,
    presentation_by_element_id: hasKeys(sessionMeta.presentation_by_element_id)
      ? sessionMeta.presentation_by_element_id
      : localMeta.presentation_by_element_id,
    hybrid_layer_by_element_id: hybridLayerByElementId,
    hybrid_v2: preferServerOverlay
      ? mergeHybridV2Doc(sessionMeta.hybrid_v2, localMeta.hybrid_v2)
      : mergeHybridV2Doc(localMeta.hybrid_v2, sessionMeta.hybrid_v2),
    drawio: preferServerOverlay
      ? mergeDrawioMeta(sessionMeta.drawio, localMeta.drawio)
      : mergeDrawioMeta(localMeta.drawio, sessionMeta.drawio),
    execution_plans: Array.isArray(sessionMeta.execution_plans) && sessionMeta.execution_plans.length
      ? sessionMeta.execution_plans
      : localMeta.execution_plans,
    auto_pass_v1: hasKeys(sessionMeta.auto_pass_v1) ? sessionMeta.auto_pass_v1 : localMeta.auto_pass_v1,
    session_companion_v1: hasKeys(sessionMeta.session_companion_v1)
      ? sessionMeta.session_companion_v1
      : localMeta.session_companion_v1,
  };
  return normalizeBpmnMeta(nextRaw, {
    fallbackHybridV2: sessionMeta.hybrid_v2,
    fallbackDrawio: sessionMeta.drawio,
  });
}

export function buildSessionMetaWriteEnvelope({
  sessionId,
  bpmnMeta,
  source = "session_meta_write",
  writeSeq = 0,
} = {}) {
  const sid = String(sessionId || "").trim();
  return {
    id: sid,
    session_id: sid,
    bpmn_meta: bpmnMeta,
    _sync_source: String(source || "session_meta_write"),
    _meta_write_seq: Number.isFinite(Number(writeSeq)) ? Number(writeSeq) : 0,
  };
}
