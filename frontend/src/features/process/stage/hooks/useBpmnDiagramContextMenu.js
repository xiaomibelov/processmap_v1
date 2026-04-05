import { useCallback, useMemo } from "react";
import {
  buildBpmnContextMenuExecutionRequest,
  buildBpmnContextMenuViewModel,
} from "../../bpmn/context-menu/bpmnContextMenuActionMatrix.js";
import useBpmnContextMenuState from "../../bpmn/context-menu/useBpmnContextMenuState.js";
import { isBpmnDiagramContextMenuBlocked } from "./bpmnDiagramContextMenuBlockState.js";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useBpmnDiagramContextMenu({
  bpmnRef,
  undoRedoState = {},
  tab,
  hasSession,
  drawioEditorOpen,
  hybridPlacementHitLayerActive,
  hybridModeEffective,
  modalOpenSignal = false,
  closeAllDiagramActions,
  setInfoMsg,
  setGenErr,
}) {
  const isBlocked = useMemo(() => {
    return isBpmnDiagramContextMenuBlocked({
      hasSession,
      tab,
      drawioEditorOpen,
      hybridPlacementHitLayerActive,
      hybridModeEffective,
    });
  }, [
    drawioEditorOpen,
    hasSession,
    hybridModeEffective,
    hybridPlacementHitLayerActive,
    tab,
  ]);

  const {
    menu,
    requestOpenMenu,
    closeMenu: closeBpmnContextMenu,
  } = useBpmnContextMenuState({
    isBlocked,
    modalOpenSignal,
    closeAllDiagramActions,
  });

  const onBpmnContextMenuDismiss = useCallback(() => {
    closeBpmnContextMenu();
  }, [closeBpmnContextMenu]);

  const buildMenuViewModel = useCallback((payloadRaw = {}) => {
    return buildBpmnContextMenuViewModel({
      payloadRaw,
      runtimeUndoRedoState: asObject(bpmnRef?.current?.getUndoRedoState?.({ mode: "editor" })),
      fallbackUndoRedoState: undoRedoState,
    });
  }, [bpmnRef, undoRedoState]);

  const onBpmnContextMenuRequest = useCallback((payloadRaw = {}) => {
    return requestOpenMenu(payloadRaw, buildMenuViewModel);
  }, [buildMenuViewModel, requestOpenMenu]);

  const runBpmnContextMenuAction = useCallback(async (actionRequestRaw) => {
    const executionRequest = buildBpmnContextMenuExecutionRequest({
      menuRaw: menu,
      actionRequestRaw,
    });
    if (!executionRequest) return;
    const { actionRequest, payload } = executionRequest;
    const closeOnSuccess = actionRequest.closeOnSuccess;

    let result = null;
    try {
      result = await Promise.resolve(
        bpmnRef?.current?.runDiagramContextAction?.(payload),
      );
    } catch (error) {
      result = { ok: false, error: String(error?.message || error || "context_action_failed") };
    }

    if (!result?.ok) {
      setGenErr?.(toText(result?.error || "Не удалось выполнить действие диаграммы."));
      return result;
    }

    if (toText(result?.message)) {
      setInfoMsg?.(toText(result.message));
    }

    if (closeOnSuccess) {
      closeBpmnContextMenu();
    }
    return result;
  }, [bpmnRef, closeBpmnContextMenu, menu, setGenErr, setInfoMsg]);

  return {
    bpmnContextMenu: menu,
    onBpmnContextMenuRequest,
    onBpmnContextMenuDismiss,
    closeBpmnContextMenu,
    runBpmnContextMenuAction,
  };
}
