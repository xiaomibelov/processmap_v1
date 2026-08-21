import { useEffect } from "react";

function toText(value) {
  return String(value || "").trim();
}

export default function useHybridKeyboardController({
  isEditableTarget,
  tab,
  diagramActionHybridToolsOpen,
  selectHybridPaletteTool,
  hybridUiVisible,
  setHybridPeekActive,
  markPlaybackOverlayInteraction,
  hybridModeEffective,
  setHybridUiPrefs,
  applyHybridModeTransition,
  setHybridV2BindPickMode,
  setDiagramActionHybridToolsOpen,
  hybridToolsCancelTransientState,
  hybridPeekActive,
  hybridUiLocked,
  hybridSelectionCount,
  hybridLayerActiveElementId,
  deleteLegacyHybridMarkers,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (typeof isEditableTarget === "function" && isEditableTarget(event.target)) return;
      if (tab !== "diagram" || hybridModeEffective !== "edit" || hybridUiLocked) return;
      const key = String(event?.key || "");
      if (key !== "Delete" && key !== "Backspace") return;
      if (Number(hybridSelectionCount || 0) > 0) return;
      const legacyId = toText(hybridLayerActiveElementId);
      if (!legacyId) return;
      if (!deleteLegacyHybridMarkers?.([legacyId], "hybrid_legacy_keyboard_delete")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    deleteLegacyHybridMarkers,
    hybridLayerActiveElementId,
    hybridModeEffective,
    hybridSelectionCount,
    hybridUiLocked,
    isEditableTarget,
    tab,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (typeof isEditableTarget === "function" && isEditableTarget(event.target)) return;
      if (tab === "diagram" && diagramActionHybridToolsOpen && !event.repeat) {
        const key = String(event?.key || "");
        if (key === "1") {
          event.preventDefault();
          selectHybridPaletteTool?.("select");
          return;
        }
        if (key === "2") {
          event.preventDefault();
          selectHybridPaletteTool?.("rect");
          return;
        }
        if (key === "3") {
          event.preventDefault();
          selectHybridPaletteTool?.("text");
          return;
        }
        if (key === "4") {
          event.preventDefault();
          selectHybridPaletteTool?.("container");
          return;
        }
      }
      if (String(event?.key || "").toLowerCase() === "h" && !event.repeat) {
        if (!hybridUiVisible) {
          setHybridPeekActive?.(true);
          markPlaybackOverlayInteraction?.({ stage: "hybrid_peek_down" });
        }
      }
      if (String(event?.key || "") === "Escape" && hybridModeEffective === "edit") {
        setHybridUiPrefs?.((prev) => applyHybridModeTransition(prev, "view"));
        setHybridV2BindPickMode?.(false);
        setDiagramActionHybridToolsOpen?.(false);
        hybridToolsCancelTransientState?.();
        markPlaybackOverlayInteraction?.({ stage: "hybrid_edit_escape" });
      }
    };
    const onKeyUp = (event) => {
      if (String(event?.key || "").toLowerCase() !== "h") return;
      if (hybridPeekActive) setHybridPeekActive?.(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    applyHybridModeTransition,
    diagramActionHybridToolsOpen,
    hybridModeEffective,
    hybridPeekActive,
    hybridUiVisible,
    hybridToolsCancelTransientState,
    isEditableTarget,
    markPlaybackOverlayInteraction,
    selectHybridPaletteTool,
    setDiagramActionHybridToolsOpen,
    setHybridPeekActive,
    setHybridUiPrefs,
    setHybridV2BindPickMode,
    tab,
  ]);
}
