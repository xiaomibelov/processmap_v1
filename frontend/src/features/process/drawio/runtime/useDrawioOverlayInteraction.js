import { useEffect, useRef } from "react";
import useDrawioInteractionGate from "./useDrawioInteractionGate.js";
import useDrawioKeyboardActions from "./useDrawioKeyboardActions.js";
import useDrawioPointerDrag from "./useDrawioPointerDrag.js";
import useDrawioSelection from "./useDrawioSelection.js";
import { bumpDrawioPerfCounter } from "./drawioRuntimeProbes.js";

export default function useDrawioOverlayInteraction({
  visible,
  hasRenderable,
  createPlacementActive,
  meta,
  layerMap,
  elementMap,
  matrixScale,
  screenToDiagram,
  onCommitMove,
  onCreateElement,
  onDeleteElement,
  onSelectionChange,
}) {
  bumpDrawioPerfCounter("drawio.interaction.hook.renders");
  const rootRef = useRef(null);
  const matrixScaleRef = useRef(Math.max(0.0001, Number(matrixScale || 1)));

  useEffect(() => {
    matrixScaleRef.current = Math.max(0.0001, Number(matrixScale || 1));
  }, [matrixScale]);

  const gate = useDrawioInteractionGate({
    visible,
    hasRenderable,
    meta,
    layerMap,
    elementMap,
  });

  const selection = useDrawioSelection({
    elementMap,
    layerMap,
    meta,
    resolveElementFlags: gate.resolveElementFlags,
    onSelectionChange,
  });

  const { draftOffset } = useDrawioPointerDrag({
    rootRef,
    hasRenderable: hasRenderable || createPlacementActive,
    visible,
    meta,
    layerMap,
    elementMap,
    matrixScaleRef,
    screenToDiagram,
    canInteractWithElement: gate.canInteractWithElement,
    canEditElement: gate.canEditElement,
    selectElement: selection.selectElement,
    clearSelection: selection.clearSelection,
    selectedIdRef: selection.selectedIdRef,
    onCommitMove,
    onCreateElement,
  });

  useDrawioKeyboardActions({
    hasRenderable,
    elementMap,
    selectedIdRef: selection.selectedIdRef,
    canEditElement: gate.canEditElement,
    onCommitMove,
    onDeleteElement,
    clearSelection: selection.clearSelection,
  });

  return {
    rootRef,
    selectedId: selection.selectedId,
    draftOffset,
  };
}
