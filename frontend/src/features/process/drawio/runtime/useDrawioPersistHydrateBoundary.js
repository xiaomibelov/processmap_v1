import { useEffect } from "react";

import { pushDeleteTrace } from "../../stage/utils/deleteTrace";
import mergeDrawioHydrateDeletions from "./drawioHydrateMergeDeletions.js";
import mergeDrawioHydrateNoteFields from "./drawioHydrateMergeNoteFields.js";
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

    // Bootstrap recovery: if the incoming snapshot (after SVG bootstrap) has elements
    // but the current store has none, force-apply to fill the element tracking gap.
    // This handles the case where drawio_elements_v1 was empty in the store (e.g.
    // after a stale server response overwrote a bootstrapped state) but svg_cache
    // still has renderable elements that need to be tracked.
    const incomingElementCount = Array.isArray(incoming.drawio_elements_v1) ? incoming.drawio_elements_v1.length : 0;
    const currentElementCount = Array.isArray(currentMeta.drawio_elements_v1) ? currentMeta.drawio_elements_v1.length : 0;
    // Exclude stale-behind-optimistic: that skip reason means a local persist already
    // committed newer data, so we must NOT override it even if current is empty.
    const needsBootstrapRecovery = incomingElementCount > 0
      && currentElementCount === 0
      && decision.reason !== "incoming_stale_behind_optimistic_persist";

    if (decision.action === "skip" && !needsBootstrapRecovery) {
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: decision.reason,
        ...decision.traceMeta,
      });
      return;
    }

    if (decision.action === "skip_and_sync_persisted_ref" && !needsBootstrapRecovery) {
      drawioPersistedMetaRef.current = incoming;
      pushDeleteTrace("drawio_hydrate_skip", {
        reason: decision.reason,
        ...decision.traceMeta,
      });
      return;
    }

    const incomingWithMergedNoteFields = mergeDrawioHydrateNoteFields({
      current: currentMeta,
      incoming,
    });
    const mergedIncoming = mergeDrawioHydrateDeletions({
      current: currentMeta,
      incoming: incomingWithMergedNoteFields,
    });
    pushDeleteTrace("drawio_hydrate_apply", decision.traceMeta);
    setDrawioMeta(mergedIncoming);
    drawioMetaRef.current = mergedIncoming;
    drawioPersistedMetaRef.current = mergedIncoming;
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
