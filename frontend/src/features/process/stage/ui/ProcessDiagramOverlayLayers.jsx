import BpmnStage from "../../../../components/process/BpmnStage";
import BpmnFragmentPlacementGhost from "../../../templates/ui/BpmnFragmentPlacementGhost";
import DrawioOverlayRenderer from "../../drawio/DrawioOverlayRenderer";
import DrawioEditorModal from "../../drawio/DrawioEditorModal";
import HybridOverlayRenderer from "../../hybrid/renderers/HybridOverlayRenderer";
import HybridContextMenu from "../../hybrid/tools/HybridContextMenu";
import HybridPersistToast from "../../hybrid/ui/HybridPersistToast";

export default function ProcessDiagramOverlayLayers({
  bpmnStageProps,
  fragmentGhostProps,
  drawioOverlayProps,
  hybridOverlayProps,
  hybridContextMenuProps,
  hybridPersistToastProps,
  drawioEditorModalProps,
}) {
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
