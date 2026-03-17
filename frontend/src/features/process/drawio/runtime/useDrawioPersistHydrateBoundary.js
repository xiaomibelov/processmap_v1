import { useEffect } from "react";
import { pushDeleteTrace } from "../../stage/utils/deleteTrace";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useDrawioPersistHydrateBoundary({
  drawioFromDraft,
  drawioMetaRef,
  drawioPersistedMetaRef,
  drawioMeta,
  setDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
}) {
  useEffect(() => {
    const incoming = normalizeDrawioMeta(drawioFromDraft);
    const incomingSig = serializeDrawioMeta(incoming);
    const currentMeta = normalizeDrawioMeta(drawioMetaRef.current);
    const persistedMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const incomingLifecycleCode = String(incoming?._lifecycle_code || "").trim();
    const currentSig = serializeDrawioMeta(currentMeta);
    const persistedSig = serializeDrawioMeta(persistedMeta);

    if (incomingSig === persistedSig && currentSig !== incomingSig) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_equals_persisted_current_differs",
        incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
        currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
      });
      return;
    }
    if (incomingSig === currentSig) {
      drawioPersistedMetaRef.current = incoming;
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_equals_current",
        incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
        currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
      });
      return;
    }
    if (!incomingLifecycleCode && !incoming.doc_xml && !incoming.svg_cache && (currentMeta.doc_xml || currentMeta.svg_cache)) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_empty_while_current_has_payload",
        incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
        currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
      });
      return;
    }
    // Guard: incoming is stale behind an optimistically persisted state.
    // Race window: syncPersistedRefs updates drawioPersistedMetaRef synchronously
    // in onOptimistic BEFORE a concurrent onSessionSync (e.g. from a BPMN save
    // response) propagates through React to drawioFromDraft. In that window,
    // persistedSig reflects the nudge offset but drawioFromDraft still carries
    // the old server value. Conditions 1/2 do not fire (incomingSig !== persistedSig)
    // so without this guard the stale incoming would overwrite drawioMetaRef.current
    // and cause savePayload to read offset_x=0.
    // Only skip when persisted has real payload (not initial-load empty), so that
    // the initial hydrate on page load is never blocked.
    const persistedHasPayload = !!(persistedMeta.doc_xml || persistedMeta.svg_cache || persistedMeta.enabled);
    if (currentSig === persistedSig && incomingSig !== persistedSig && persistedHasPayload) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_stale_behind_optimistic_persist",
        incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
        currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
      });
      return;
    }
    pushDeleteTrace("drawio_hydrate_apply", {
      incomingSvg: Number(String(incoming?.svg_cache || "").length || 0),
      incomingElements: Number(Array.isArray(incoming?.drawio_elements_v1) ? incoming.drawio_elements_v1.length : 0),
      currentSvg: Number(String(currentMeta?.svg_cache || "").length || 0),
    });
    setDrawioMeta(incoming);
    drawioMetaRef.current = incoming;
    drawioPersistedMetaRef.current = incoming;
  }, [
    drawioFromDraft,
    drawioMetaRef,
    drawioPersistedMetaRef,
    normalizeDrawioMeta,
    serializeDrawioMeta,
    setDrawioMeta,
  ]);

  useEffect(() => {
    drawioMetaRef.current = normalizeDrawioMeta(asObject(drawioMeta));
  }, [drawioMeta, drawioMetaRef, normalizeDrawioMeta]);
}
