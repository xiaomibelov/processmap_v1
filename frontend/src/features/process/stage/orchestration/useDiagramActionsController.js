import useDiagramActionPopovers from "../hooks/useDiagramActionPopovers";
import useProcessStageActionsController from "../controllers/useProcessStageActionsController";

export default function useDiagramActionsController({
  popovers = {},
  actions = {},
}) {
  const { closeAllDiagramActions } = useDiagramActionPopovers(popovers);
  const stageActions = useProcessStageActionsController({
    ...actions,
    closeAllDiagramActions,
  });

  return {
    closeAllDiagramActions,
    stageActions,
  };
}
