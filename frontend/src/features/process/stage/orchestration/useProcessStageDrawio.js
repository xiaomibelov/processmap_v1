import { useEffect, useMemo } from "react";

import useDiagramRuntimeBridges from "./useDiagramRuntimeBridges";
import { readDrawioAnchorValidationState } from "../../drawio/drawioAnchors";

export default function useProcessStageDrawio({
  draft,
  overlay,
  runtimeGlueConfig,
  setDrawioSelectedElementId,
}) {
  const drawioAnchorValidationState = useMemo(() => readDrawioAnchorValidationState({
    nodes: draft?.nodes,
    bpmn_xml: draft?.bpmn_xml,
  }), [draft?.bpmn_xml, draft?.nodes]);

  const runtimeBridge = useDiagramRuntimeBridges({
    overlay,
    runtimeGlueConfig: {
      ...runtimeGlueConfig,
      draft,
      drawioAnchorValidationState,
    },
  });

  useEffect(() => {
    if (runtimeBridge.drawioModeEffective !== "view") return;
    setDrawioSelectedElementId("");
  }, [runtimeBridge.drawioModeEffective, setDrawioSelectedElementId]);

  const {
    drawioEditorBridge,
    ...restRuntimeBridge
  } = runtimeBridge;

  const {
    openEmbeddedDrawioEditor,
    closeEmbeddedDrawioEditor,
    handleDrawioEditorSave,
    exportEmbeddedDrawio,
    handleDrawioImportFile,
  } = drawioEditorBridge;

  return {
    ...restRuntimeBridge,
    drawioEditorBridge,
    openEmbeddedDrawioEditor,
    closeEmbeddedDrawioEditor,
    handleDrawioEditorSave,
    exportEmbeddedDrawio,
    handleDrawioImportFile,
  };
}
