import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resolveBpmnContextMenuActions,
  resolveBpmnContextMenuHeader,
  resolveBpmnContextMenuQuickEdit,
  resolveBpmnContextTargetKind,
} from "../../bpmn/context-menu/bpmnContextMenuActionMatrix.js";
import useBpmnContextMenuState from "../../bpmn/context-menu/useBpmnContextMenuState.js";

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
  onActionResult,
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
    openMenu,
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

  const onBpmnContextMenuRequest = useCallback((payloadRaw = {}) => {
    if (isBlocked) return false;
    const payload = asObject(payloadRaw);
    const targetBase = asObject(payload.target);
    const runtimeUndoRedo = asObject(bpmnRef?.current?.getUndoRedoState?.({ mode: "editor" }));
    const undoRedo = {
      canUndo: runtimeUndoRedo.canUndo === true || asObject(undoRedoState).canUndo === true,
      canRedo: runtimeUndoRedo.canRedo === true || asObject(undoRedoState).canRedo === true,
    };
    const target = {
      ...targetBase,
      canUndo: undoRedo.canUndo,
      canRedo: undoRedo.canRedo,
    };
    const targetKind = resolveBpmnContextTargetKind(target);
    const actions = resolveBpmnContextMenuActions(target);
    if (!actions.length) return false;
    return openMenu({
      sessionId: toText(payload.sessionId),
      clientX: Number(payload.clientX || 0),
      clientY: Number(payload.clientY || 0),
      header: resolveBpmnContextMenuHeader(target),
      kind: targetKind,
      target,
      actions,
      quickEdit: resolveBpmnContextMenuQuickEdit(target),
    });
  }, [bpmnRef, isBlocked, openMenu, undoRedoState]);

  const runBpmnContextMenuAction = useCallback(async (actionRequestRaw) => {
    const actionRequest = asObject(actionRequestRaw);
    const actionId = toText(
      typeof actionRequestRaw === "string"
        ? actionRequestRaw
        : (actionRequest.actionId || actionRequest.id),
    );
    if (!menu || !actionId) return;
    const closeOnSuccess = actionRequest.closeOnSuccess !== false;
    const actionMeta = asObject(actionRequest.actionMeta);

    const payload = {
      actionId,
      target: asObject(menu.target),
      clientX: Number(menu.clientX || 0),
      clientY: Number(menu.clientY || 0),
      value: String(actionRequest.value ?? ""),
      actionMeta,
    };

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

  const openBpmnSubprocessPreviewProperties = useCallback(async () => {
    const preview = asObject(bpmnSubprocessPreview);
    const targetId = toText(preview.targetId);
    if (!targetId) return { ok: false, error: "preview_target_missing" };
    const previewMenu = {
      target: { id: targetId, kind: "element" },
      clientX: Number(preview.clientX || 0),
      clientY: Number(preview.clientY || 0),
    };
    let result = null;
    try {
      result = await Promise.resolve(
        bpmnRef?.current?.runDiagramContextAction?.({
          actionId: "open_properties",
          target: asObject(previewMenu.target),
          clientX: Number(previewMenu.clientX || 0),
          clientY: Number(previewMenu.clientY || 0),
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
    emitActionResult({
      actionId: "open_properties",
      actionMeta: {},
      menu: previewMenu,
      result,
    });
    return result;
  }, [bpmnRef, bpmnSubprocessPreview, emitActionResult, setGenErr, setInfoMsg]);

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
