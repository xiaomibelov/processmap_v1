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
    if (!incoming.doc_xml && !incoming.svg_cache && (currentMeta.doc_xml || currentMeta.svg_cache)) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: "incoming_empty_while_current_has_payload",
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
