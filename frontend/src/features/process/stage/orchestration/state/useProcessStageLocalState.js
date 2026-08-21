import { useCallback } from "react";
import useProcessStageActionState from "./useProcessStageActionState";
import useProcessStageDialogState from "./useProcessStageDialogState";
import useProcessStageModeState from "./useProcessStageModeState";
import useProcessStagePanelState from "./useProcessStagePanelState";

export default function useProcessStageLocalState({
  sid,
  readCommandHistory,
  readCommandMode,
  readDiagramMode,
  readQualityProfile,
} = {}) {
  const modeState = useProcessStageModeState({
    readCommandMode,
    readDiagramMode,
    readQualityProfile,
  });
  const actionState = useProcessStageActionState({
    sid,
    readCommandHistory,
  });
  const dialogState = useProcessStageDialogState();
  const panelState = useProcessStagePanelState();
  const resetActionsForSession = actionState.resetActionsForSession;
  const resetDialogsForSession = dialogState.resetDialogsForSession;
  const resetPanelsForSession = panelState.resetPanelsForSession;

  const resetLocalStateForSession = useCallback((options = {}) => {
    resetActionsForSession();
    resetDialogsForSession();
    resetPanelsForSession();
    if (options.autoPassToastJobIdRef && typeof options.autoPassToastJobIdRef === "object") {
      options.autoPassToastJobIdRef.current = "";
    }
    if (typeof options.setDiagramFocusMode === "function") {
      options.setDiagramFocusMode(false);
    }
    if (typeof options.setDiagramFullscreenActive === "function") {
      options.setDiagramFullscreenActive(false);
    }
  }, [resetActionsForSession, resetDialogsForSession, resetPanelsForSession]);

  return {
    ...modeState,
    ...actionState,
    ...dialogState,
    ...panelState,
    resetLocalStateForSession,
  };
}
