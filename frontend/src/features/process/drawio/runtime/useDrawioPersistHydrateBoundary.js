import { useEffect } from "react";

import { pushDeleteTrace } from "../../stage/utils/deleteTrace";
import decideDrawioPersistHydrateAction from "./drawioPersistHydrateDecision.js";

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
    const currentMeta = normalizeDrawioMeta(drawioMetaRef.current);
    const persistedMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const decision = decideDrawioPersistHydrateAction({
      incoming,
      current: currentMeta,
      persisted: persistedMeta,
      serializeDrawioMeta,
    });

    if (decision.action === "skip") {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: decision.reason,
        ...decision.traceMeta,
      });
      return;
    }

    if (decision.action === "skip_and_sync_persisted_ref") {
      drawioPersistedMetaRef.current = incoming;
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: decision.reason,
        ...decision.traceMeta,
      });
      return;
    }

    pushDeleteTrace("drawio_hydrate_apply", decision.traceMeta);
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
