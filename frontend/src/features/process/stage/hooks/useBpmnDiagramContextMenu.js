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
  onActionResult,
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

  const emitActionResult = useCallback(({
    actionId,
    actionMeta = {},
    menu: menuRaw,
    result,
  } = {}) => {
    if (!toText(actionId)) return;
    onActionResult?.({
      actionId: toText(actionId),
      actionMeta: asObject(actionMeta),
      menu: asObject(menuRaw),
      result: asObject(result),
    });
  }, [onActionResult]);

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
    const actionId = actionRequest.actionId;
    const actionMeta = asObject(asObject(actionRequestRaw).actionMeta);
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

    emitActionResult({
      actionId,
      actionMeta,
      menu,
      result: asObject(result),
    });

    if (closeOnSuccess) {
      closeBpmnContextMenu();
    }
    return result;
  }, [bpmnRef, closeBpmnContextMenu, emitActionResult, menu, setGenErr, setInfoMsg]);

  return {
    bpmnContextMenu: menu,
    onBpmnContextMenuRequest,
    onBpmnContextMenuDismiss,
    closeBpmnContextMenu,
    runBpmnContextMenuAction,
  };
}
