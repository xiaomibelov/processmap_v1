import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resolveBpmnContextMenuActions,
  resolveBpmnContextMenuHeader,
} from "../../bpmn/context-menu/bpmnContextMenuActionMatrix";

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
  const [menu, setMenu] = useState(null);

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

  const closeBpmnContextMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const onBpmnContextMenuDismiss = useCallback(() => {
    setMenu(null);
  }, []);

  const onBpmnContextMenuRequest = useCallback((payloadRaw = {}) => {
    if (isBlocked) return false;
    const payload = asObject(payloadRaw);
    const target = asObject(payload.target);
    const actions = resolveBpmnContextMenuActions(target);
    if (!actions.length) return false;
    closeAllDiagramActions?.();
    setMenu({
      sessionId: toText(payload.sessionId),
      clientX: Number(payload.clientX || 0),
      clientY: Number(payload.clientY || 0),
      header: resolveBpmnContextMenuHeader(target),
      target,
      actions,
    });
    return true;
  }, [closeAllDiagramActions, isBlocked]);

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
    setMenu(null);
  }, [bpmnRef, menu, setGenErr, setInfoMsg]);

  useEffect(() => {
    if (!menu) return undefined;
    const onPointerDown = () => setMenu(null);
    const onKeyDown = (event) => {
      if (String(event?.key || "") !== "Escape") return;
      setMenu(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    if (isBlocked) setMenu(null);
  }, [isBlocked, menu]);

  useEffect(() => {
    if (!menu) return;
    if (modalOpenSignal) setMenu(null);
  }, [menu, modalOpenSignal]);

  return {
    bpmnContextMenu: menu,
    onBpmnContextMenuRequest,
    onBpmnContextMenuDismiss,
    closeBpmnContextMenu,
    runBpmnContextMenuAction,
  };
}

