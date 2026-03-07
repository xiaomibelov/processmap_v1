import useBpmnViewportSource, {
  buildOverlayMatrixFromSnapshot,
} from "./useBpmnViewportSource.js";
import useOverlayViewportSync from "./useOverlayViewportSync.js";

export default function useDiagramOverlayTransform({
  enabled = true,
  canvasApi,
}) {
  const viewportSource = useBpmnViewportSource({
    enabled,
    canvasApi,
  });
  return useOverlayViewportSync({
    enabled,
    viewportSource,
  });
}

export {
  buildOverlayMatrixFromSnapshot,
};
