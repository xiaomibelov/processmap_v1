import { useCallback } from "react";
import { resolveDrawioElementFlags } from "./drawioOverlayState.js";

function isDrawioInteractionEnabled(visible, hasRenderable) {
  return !!visible && !!hasRenderable;
}

function canInteractWithDrawioElement({
  interactionEnabled,
  meta,
  layerMap,
  elementMap,
  elementId,
}) {
  if (!interactionEnabled) return false;
  return resolveDrawioElementFlags(meta, layerMap, elementMap, elementId).visible;
}

function canEditDrawioElement({
  interactionEnabled,
  meta,
  layerMap,
  elementMap,
  elementId,
}) {
  if (!interactionEnabled) return false;
  return resolveDrawioElementFlags(meta, layerMap, elementMap, elementId).editable;
}

export default function useDrawioInteractionGate({
  visible,
  hasRenderable,
  meta,
  layerMap,
  elementMap,
}) {
  const interactionEnabled = isDrawioInteractionEnabled(visible, hasRenderable);

  const resolveElementFlags = useCallback((elementIdRaw) => (
    resolveDrawioElementFlags(meta, layerMap, elementMap, elementIdRaw)
  ), [elementMap, layerMap, meta]);

  const canInteractWithElement = useCallback((elementIdRaw) => {
    return canInteractWithDrawioElement({
      interactionEnabled,
      meta,
      layerMap,
      elementMap,
      elementId: elementIdRaw,
    });
  }, [elementMap, interactionEnabled, layerMap, meta]);

  const canEditElement = useCallback((elementIdRaw) => {
    return canEditDrawioElement({
      interactionEnabled,
      meta,
      layerMap,
      elementMap,
      elementId: elementIdRaw,
    });
  }, [elementMap, interactionEnabled, layerMap, meta]);

  return {
    interactionEnabled,
    resolveElementFlags,
    canInteractWithElement,
    canEditElement,
  };
}

export {
  isDrawioInteractionEnabled,
  canInteractWithDrawioElement,
  canEditDrawioElement,
};
