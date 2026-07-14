import { useEffect } from "react";

// Pure hotkey model + thin React hook for the diagram search spotlight.
// Pure predicates are unit-tested in diagramSearchHotkey.test.mjs (pure-node).

export function isEditableEventTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName || "").toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (target.isContentEditable === true) return true;
  const closest = target.closest;
  if (typeof closest === "function") {
    try {
      if (closest("[contenteditable='true']")) return true;
    } catch {
      // ignore selector errors on exotic targets
    }
  }
  return false;
}

export function isSearchHotkeyEvent(event) {
  if (!event || typeof event !== "object") return false;
  const key = String(event.key || "").toLowerCase();
  if (key !== "k") return false;
  if (!event.ctrlKey && !event.metaKey) return false;
  if (event.shiftKey || event.altKey) return false;
  return true;
}

export default function useDiagramSearchHotkey({
  enabled = true,
  isOpen = false,
  onOpen = null,
  onFocus = null,
} = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event) => {
      if (!isSearchHotkeyEvent(event)) return;
      if (isEditableEventTarget(event.target)) return;
      event.preventDefault();
      if (isOpen) {
        if (typeof onFocus === "function") onFocus();
        return;
      }
      if (typeof onOpen === "function") onOpen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, isOpen, onFocus, onOpen]);
}
