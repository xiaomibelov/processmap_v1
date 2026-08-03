import { useEffect, useState } from "react";

/**
 * FIX-V (блок 2): общий резолвер позиции «якоря» диаграмм-тулбара для
 * toast-viewport. Логика повторяет исторический резолвер ProcessSaveAckToast
 * (он залочен source-contract тестом и не может быть разделён без правки
 * контракта): header notification anchor → правый слот тулбара → action bar.
 *
 * Возвращает DOMRect-подобный объект {left, top, right, bottom, width, height,
 * kind} или null, если якорь не найден / вне браузера.
 */
export function resolveDiagramToolbarAnchorRect() {
  if (typeof document === "undefined") return null;

  const readRect = (node, kind) => {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    const rect = node.getBoundingClientRect();
    if (
      !Number.isFinite(rect.left)
      || !Number.isFinite(rect.top)
      || rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      kind,
    };
  };

  const headerAnchor = readRect(
    document.querySelector('[data-testid="diagram-toolbar-notification-anchor"]'),
    "header-anchor",
  );
  if (headerAnchor) return headerAnchor;

  const headerSlot = readRect(
    document.querySelector(".diagramToolbarSlot--right"),
    "header-slot",
  );
  if (headerSlot) return headerSlot;

  return readRect(document.querySelector(".diagramActionBar"), "diagram-toolbar");
}

export default function useDiagramToolbarAnchorRect(enabled = true) {
  const [anchorRect, setAnchorRect] = useState(null);

  useEffect(() => {
    if (enabled !== true) {
      setAnchorRect(null);
      return undefined;
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }
    const update = () => {
      setAnchorRect(resolveDiagramToolbarAnchorRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [enabled]);

  return anchorRect;
}
