import { mergeSessionMetaForRead } from "../write/sessionMetaMergePolicy.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function buildSessionMetaReadModel({
  sessionMetaRaw,
  localMetaRaw,
  normalizeBpmnMeta,
  normalizeHybridLayerMap,
  mergeHybridV2Doc,
  mergeDrawioMeta,
  preferServerOverlay = true,
}) {
  const canonicalPersistedMeta = normalizeBpmnMeta(asObject(sessionMetaRaw));
  const derivedReadMeta = mergeSessionMetaForRead({
    sessionMetaRaw: canonicalPersistedMeta,
    localMetaRaw,
    normalizeBpmnMeta,
    normalizeHybridLayerMap,
    mergeHybridV2Doc,
    mergeDrawioMeta,
    preferServerOverlay,
  });
  const transientUiFields = {
    localOverlayFallbackUsed: !Object.keys(asObject(canonicalPersistedMeta.hybrid_layer_by_element_id)).length
      && !!Object.keys(asObject(derivedReadMeta.hybrid_layer_by_element_id)).length,
    drawioFallbackUsed: !asObject(canonicalPersistedMeta.drawio).doc_xml
      && !asObject(canonicalPersistedMeta.drawio).svg_cache
      && !!(asObject(derivedReadMeta.drawio).doc_xml || asObject(derivedReadMeta.drawio).svg_cache),
  };
  return {
    canonicalPersistedMeta,
    derivedReadMeta,
    transientUiFields,
  };
}
