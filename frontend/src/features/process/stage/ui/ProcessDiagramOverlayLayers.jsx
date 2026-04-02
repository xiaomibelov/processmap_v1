import { memo } from "react";
import BpmnStage from "../../../../components/process/BpmnStage";
import BpmnFragmentPlacementGhost from "../../../templates/ui/BpmnFragmentPlacementGhost";
import DrawioOverlayRenderer from "../../drawio/DrawioOverlayRenderer";
import DrawioEditorModal from "../../drawio/DrawioEditorModal";
import { bumpDrawioPerfCounter } from "../../drawio/runtime/drawioRuntimeProbes.js";
import HybridOverlayRenderer from "../../hybrid/renderers/HybridOverlayRenderer";
import HybridContextMenu from "../../hybrid/tools/HybridContextMenu";
import HybridPersistToast from "../../hybrid/ui/HybridPersistToast";

function ProcessDiagramOverlayLayers({
  bpmnStageProps,
  fragmentGhostProps,
  drawioOverlayProps,
  hybridOverlayProps,
  hybridContextMenuProps,
  hybridPersistToastProps,
  drawioEditorModalProps,
}) {
  bumpDrawioPerfCounter("overlay.renderer.layers.renders");
  return (
    <>
      <BpmnStage {...bpmnStageProps} />
      <BpmnFragmentPlacementGhost {...fragmentGhostProps} />
      <DrawioOverlayRenderer {...drawioOverlayProps} />
      <HybridOverlayRenderer {...hybridOverlayProps} />
      <HybridContextMenu {...hybridContextMenuProps} />
      <HybridPersistToast {...hybridPersistToastProps} />
      <DrawioEditorModal {...drawioEditorModalProps} />
    </>
  );
}

export default memo(ProcessDiagramOverlayLayers);
