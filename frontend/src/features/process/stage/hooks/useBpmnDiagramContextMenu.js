import { useCallback, useMemo } from "react";
import {
  resolveBpmnContextMenuActions,
  resolveBpmnContextMenuHeader,
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

  const onBpmnContextMenuRequest = useCallback((payloadRaw = {}) => {
    if (isBlocked) return false;
    const payload = asObject(payloadRaw);
    const target = asObject(payload.target);
    const actions = resolveBpmnContextMenuActions(target);
    if (!actions.length) return false;
    return openMenu({
      sessionId: toText(payload.sessionId),
      clientX: Number(payload.clientX || 0),
      clientY: Number(payload.clientY || 0),
      header: resolveBpmnContextMenuHeader(target),
      target,
      actions,
    });
  }, [isBlocked, openMenu]);

  const runBpmnContextMenuAction = useCallback(async (actionIdRaw) => {
    const actionId = toText(actionIdRaw);
    if (!menu || !actionId) return;

    const payload = {
      actionId,
      target: asObject(menu.target),
      clientX: Number(menu.clientX || 0),
      clientY: Number(menu.clientY || 0),
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
      setGenErr?.(toText(result?.error || "Diagram action failed."));
      return;
    }

    if (toText(result?.message)) {
      setInfoMsg?.(toText(result.message));
    }

    closeBpmnContextMenu();
  }, [bpmnRef, closeBpmnContextMenu, menu, setGenErr, setInfoMsg]);

  return {
    bpmnContextMenu: menu,
    onBpmnContextMenuRequest,
    onBpmnContextMenuDismiss,
    closeBpmnContextMenu,
    runBpmnContextMenuAction,
  };
}
