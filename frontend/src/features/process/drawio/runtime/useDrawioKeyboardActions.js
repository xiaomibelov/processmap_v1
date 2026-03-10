import { useEffect } from "react";
import { asObject, toNumber } from "./drawioOverlayState.js";
import { traceDrawioRuntime } from "./drawioRuntimeProbes.js";

function normalizeSelectedId(selectedIdRaw) {
  return String(selectedIdRaw || "").trim();
}

function resolveDrawioKeyboardAction({
  keyRaw,
  shiftKey,
  selectedIdRaw,
  editable,
  elementStateRaw,
}) {
  const selectedId = normalizeSelectedId(selectedIdRaw);
  if (!selectedId || !editable) return { type: "none" };
  const key = String(keyRaw || "");
  if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
    const step = shiftKey ? 24 : 12;
    const elementState = asObject(elementStateRaw);
    const baseX = toNumber(elementState.offset_x, 0);
    const baseY = toNumber(elementState.offset_y, 0);
    const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0;
    const dy = key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0;
    return {
      type: "move",
      payload: {
        id: selectedId,
        offsetX: baseX + dx,
        offsetY: baseY + dy,
      },
    };
  }
  if (key === "Delete" || key === "Backspace") {
    return {
      type: "delete",
      payload: { id: selectedId },
    };
  }
  return { type: "none" };
}

export default function useDrawioKeyboardActions({
  hasRenderable,
  elementMap,
  selectedIdRef,
  canEditElement,
  onCommitMove,
  onDeleteElement,
  clearSelection,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!hasRenderable) return;
      const target = event?.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const activeId = normalizeSelectedId(selectedIdRef.current);
      if (!activeId) return;
      const action = resolveDrawioKeyboardAction({
        keyRaw: event?.key,
        shiftKey: event.shiftKey === true,
        selectedIdRaw: activeId,
        editable: canEditElement(activeId),
        elementStateRaw: elementMap.get(activeId),
      });
      if (action.type === "move") {
        onCommitMove?.(action.payload);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (action.type === "delete") {
        traceDrawioRuntime("drawio_keyboard_delete", {
          activeId,
        });
        const handled = onDeleteElement?.(activeId);
        if (!handled) return;
        event.preventDefault();
        event.stopPropagation();
        clearSelection("keyboard_delete");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canEditElement,
    clearSelection,
    elementMap,
    hasRenderable,
    onCommitMove,
    onDeleteElement,
    selectedIdRef,
  ]);
}

export {
  normalizeSelectedId,
  resolveDrawioKeyboardAction,
};
