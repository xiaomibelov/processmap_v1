import { useCallback } from "react";

import { OVERLAY_ENTITY_KINDS, normalizeOverlayEntityKind } from "../../drawio/domain/drawioEntityKinds.js";
import { publishDrawioNormalizationSnapshot } from "../../drawio/runtime/drawioNormalizationDiagnostics.js";
import { pushDeleteTrace } from "../../stage/utils/deleteTrace.js";
import {
  asObject,
  normalizeIdList,
  toText,
} from "./drawioMutationShared.js";
import useDrawioMutationApi from "./useDrawioMutationApi.js";

export default function useOverlayMutationGateway({
  sessionId,
  drawioMetaRef,
  normalizeDrawioMeta,
  applyDrawioMutation,
  deleteSelectedHybridIds,
  deleteLegacyHybridMarkers,
  setInfoMsg,
  setGenErr,
}) {
  const publishNormalization = useCallback((source = "overlay_mutation") => {
    publishDrawioNormalizationSnapshot({
      sessionId,
      drawioMeta: normalizeDrawioMeta(drawioMetaRef.current),
      source,
    });
  }, [drawioMetaRef, normalizeDrawioMeta, sessionId]);

  const drawioMutationApi = useDrawioMutationApi({
    drawioMetaRef,
    normalizeDrawioMeta,
    applyDrawioMutation,
    publishNormalization,
    setInfoMsg,
    setGenErr,
  });

  const deleteOverlayEntity = useCallback((entityRaw, source = "overlay_delete_entity") => {
    const entity = asObject(entityRaw);
    const entityKind = normalizeOverlayEntityKind(entity.entityKind || entity.kind);
    const entityIds = normalizeIdList(entity.entityIds);
    const entityId = toText(entity.entityId) || entityIds[0];
    if (!entityKind || (!entityId && !entityIds.length)) return false;
    if (entityKind === OVERLAY_ENTITY_KINDS.DRAWIO) {
      return drawioMutationApi.deleteDrawioElement(entityId, source);
    }
    if (entityKind === OVERLAY_ENTITY_KINDS.HYBRID) {
      const ids = entityIds.length ? entityIds : [entityId];
      const deleted = !!deleteSelectedHybridIds?.(ids);
      pushDeleteTrace("overlay_gateway_delete_hybrid", {
        source,
        ids,
        deleted,
      });
      return deleted;
    }
    if (entityKind === OVERLAY_ENTITY_KINDS.LEGACY) {
      const ids = entityIds.length ? entityIds : [entityId];
      const deleted = !!deleteLegacyHybridMarkers?.(ids, source);
      pushDeleteTrace("overlay_gateway_delete_legacy", {
        source,
        ids,
        deleted,
      });
      return deleted;
    }
    return false;
  }, [deleteLegacyHybridMarkers, deleteSelectedHybridIds, drawioMutationApi]);

  return {
    ...drawioMutationApi,
    deleteOverlayEntity,
  };
}
