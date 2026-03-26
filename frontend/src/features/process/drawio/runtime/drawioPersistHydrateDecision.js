function buildTraceMeta(metaRaw = {}) {
  return {
    incomingSvg: Number(String(metaRaw?.incoming?.svg_cache || "").length || 0),
    currentSvg: Number(String(metaRaw?.current?.svg_cache || "").length || 0),
    incomingElements: Number(Array.isArray(metaRaw?.incoming?.drawio_elements_v1) ? metaRaw.incoming.drawio_elements_v1.length : 0),
  };
}

export default function decideDrawioPersistHydrateAction({
  incoming,
  current,
  persisted,
  serializeDrawioMeta,
}) {
  const incomingLifecycleCode = String(incoming?._lifecycle_code || "").trim();
  const incomingSig = serializeDrawioMeta(incoming);
  const currentSig = serializeDrawioMeta(current);
  const persistedSig = serializeDrawioMeta(persisted);
  const traceMeta = buildTraceMeta({ incoming, current });

  if (incomingSig === persistedSig && currentSig !== incomingSig) {
    return {
      action: "skip",
      reason: "incoming_equals_persisted_current_differs",
      traceMeta,
    };
  }
  if (incomingSig === currentSig) {
    return {
      action: "skip_and_sync_persisted_ref",
      reason: "incoming_equals_current",
      traceMeta,
    };
  }
  if (!incomingLifecycleCode && !incoming.doc_xml && !incoming.svg_cache && (current.doc_xml || current.svg_cache)) {
    return {
      action: "skip",
      reason: "incoming_empty_while_current_has_payload",
      traceMeta,
    };
  }
  // If current has explicit deletions and incoming has the same SVG but no deletions,
  // the incoming is likely a stale server snapshot (bootstrap from SVG before the
  // deletion persist was committed). Protect local deletion state.
  const currentDeletedIds = Array.isArray(current.drawio_elements_v1)
    ? current.drawio_elements_v1.filter((el) => el && el.deleted === true).map((el) => String(el.id || "")).filter(Boolean)
    : [];
  if (
    currentDeletedIds.length > 0
    && current.svg_cache
    && current.svg_cache.length === (incoming.svg_cache || "").length
    && current.svg_cache === incoming.svg_cache
    && Array.isArray(incoming.drawio_elements_v1)
    && incoming.drawio_elements_v1.every((el) => el && el.deleted !== true)
  ) {
    return {
      action: "skip",
      reason: "incoming_missing_local_deletions",
      traceMeta: { ...traceMeta, deletedCount: currentDeletedIds.length },
    };
  }
  const persistedHasPayload = !!(persisted.doc_xml || persisted.svg_cache || persisted.enabled);
  if (currentSig === persistedSig && incomingSig !== persistedSig && persistedHasPayload) {
    return {
      action: "skip",
      reason: "incoming_stale_behind_optimistic_persist",
      traceMeta,
    };
  }
  return {
    action: "apply",
    reason: "apply_incoming_snapshot",
    traceMeta,
  };
}
