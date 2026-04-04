import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resolveBpmnContextMenuActions,
  resolveBpmnContextMenuHeader,
  resolveBpmnContextMenuQuickEdit,
  resolveBpmnContextTargetKind,
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

    const payload = {
      actionId,
      target: asObject(menu.target),
      clientX: Number(menu.clientX || 0),
      clientY: Number(menu.clientY || 0),
      value: String(actionRequest.value ?? ""),
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
