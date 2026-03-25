import { useCallback } from "react";

import { getDrawioOverlayStatus } from "../../drawio/domain/drawioVisibility.js";
import useDrawioElementContentMutationApi from "./useDrawioElementContentMutationApi.js";
import useDrawioElementStateMutationApi from "./useDrawioElementStateMutationApi.js";
import useDrawioMetaMutationApi from "./useDrawioMetaMutationApi.js";

export default function useDrawioMutationApi({
  drawioMetaRef,
  normalizeDrawioMeta,
  applyDrawioMutation,
  publishNormalization,
  setInfoMsg,
  setGenErr,
}) {
  const metaMutationApi = useDrawioMetaMutationApi({
    normalizeDrawioMeta,
    applyDrawioMutation,
    publishNormalization,
  });

  const elementStateMutationApi = useDrawioElementStateMutationApi({
    drawioMetaRef,
    normalizeDrawioMeta,
    applyDrawioMutation,
    publishNormalization,
    setInfoMsg,
    setGenErr,
  });

  const elementContentMutationApi = useDrawioElementContentMutationApi({
    drawioMetaRef,
    normalizeDrawioMeta,
    applyDrawioMutation,
    publishNormalization,
    setInfoMsg,
    setGenErr,
  });

  const getDrawioStatus = useCallback(() => getDrawioOverlayStatus(drawioMetaRef.current), [drawioMetaRef]);

  return {
    ...metaMutationApi,
    ...elementStateMutationApi,
    ...elementContentMutationApi,
    getDrawioStatus,
  };
}
