import { useEffect } from "react";
import { asObject, toNumber } from "./drawioOverlayState.js";
import { traceDrawioRuntime } from "./drawioRuntimeProbes.js";

function normalizeSelectedId(selectedIdRaw) {
  return String(selectedIdRaw || "").trim();
}

const TOOL_SHORTCUT_MAP = {
  v: "select",
  r: "rect",
  t: "text",
  c: "container",
  s: "note",
};

function resolveDrawioKeyboardAction({
  keyRaw,
  shiftKey,
  ctrlKey,
  selectedIdRaw,
  editable,
  elementStateRaw,
}) {
  const key = String(keyRaw || "");
  const selectedId = normalizeSelectedId(selectedIdRaw);

  if (key === "Escape" && selectedId) {
    return { type: "deselect" };
  }

  const toolId = TOOL_SHORTCUT_MAP[key.toLowerCase()];
  if (toolId && !ctrlKey && !shiftKey) {
    return { type: "tool", payload: { toolId } };
  }

  if (!selectedId || !editable) return { type: "none" };
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
  onSwitchTool,
  clearSelection,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!hasRenderable) return;
      const target = event?.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const activeId = normalizeSelectedId(selectedIdRef.current);
      const action = resolveDrawioKeyboardAction({
        keyRaw: event?.key,
        shiftKey: event.shiftKey === true,
        ctrlKey: event.ctrlKey === true || event.metaKey === true,
        selectedIdRaw: activeId,
        editable: activeId ? canEditElement(activeId) : false,
        elementStateRaw: activeId ? elementMap.get(activeId) : undefined,
      });
      if (action.type === "deselect") {
        clearSelection("keyboard_escape");
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (action.type === "tool") {
        onSwitchTool?.(action.payload.toolId);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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
    onSwitchTool,
    selectedIdRef,
  ]);
}

export {
  normalizeSelectedId,
  resolveDrawioKeyboardAction,
};
