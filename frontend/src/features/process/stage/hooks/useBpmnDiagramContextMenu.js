import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildBpmnContextMenuExecutionRequest,
  buildBpmnContextMenuViewModel,
} from "../../bpmn/context-menu/bpmnContextMenuActionMatrix";
import useBpmnContextMenuState from "../../bpmn/context-menu/useBpmnContextMenuState";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function isHybridOwnershipActive(modeRaw) {
  const mode = toText(modeRaw).toLowerCase();
  return mode === "edit" || mode === "place" || mode === "bind";
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
    if (!hasSession) return true;
    if (tab !== "diagram") return true;
    if (drawioEditorOpen) return true;
    if (hybridPlacementHitLayerActive) return true;
    if (isHybridOwnershipActive(hybridModeEffective)) return true;
    return false;
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
  const [bpmnSubprocessPreview, setBpmnSubprocessPreview] = useState(null);
  const closeBpmnSubprocessPreview = useCallback(() => {
    setBpmnSubprocessPreview(null);
  }, []);

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

    if (result?.openInsidePreview && typeof result.openInsidePreview === "object") {
      setBpmnSubprocessPreview({
        ...asObject(result.openInsidePreview),
        targetId: toText(asObject(result.openInsidePreview).targetId || asObject(menu.target).id),
      });
      closeBpmnContextMenu();
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

  const openBpmnSubprocessPreviewProperties = useCallback(async () => {
    const targetId = toText(asObject(bpmnSubprocessPreview).targetId);
    if (!targetId) return { ok: false, error: "preview_target_missing" };
    let result = null;
    try {
      result = await Promise.resolve(
        bpmnRef?.current?.runDiagramContextAction?.({
          actionId: "open_properties",
          target: { id: targetId, kind: "element" },
          clientX: Number(asObject(bpmnSubprocessPreview).clientX || 0),
          clientY: Number(asObject(bpmnSubprocessPreview).clientY || 0),
          value: "",
        }),
      );
    } catch (error) {
      result = { ok: false, error: String(error?.message || error || "context_action_failed") };
    }
    if (!result?.ok) {
      setGenErr?.(toText(result?.error || "Не удалось открыть свойства подпроцесса."));
      return result;
    }
    setBpmnSubprocessPreview(null);
    if (toText(result?.message)) setInfoMsg?.(toText(result.message));
    return result;
  }, [bpmnRef, bpmnSubprocessPreview, setGenErr, setInfoMsg]);

  useEffect(() => {
    if (!isBlocked) return;
    setBpmnSubprocessPreview(null);
  }, [isBlocked]);

  return {
    bpmnContextMenu: menu,
    onBpmnContextMenuRequest,
    onBpmnContextMenuDismiss,
    closeBpmnContextMenu,
    runBpmnContextMenuAction,
    bpmnSubprocessPreview,
    closeBpmnSubprocessPreview,
    openBpmnSubprocessPreviewProperties,
  };
}
