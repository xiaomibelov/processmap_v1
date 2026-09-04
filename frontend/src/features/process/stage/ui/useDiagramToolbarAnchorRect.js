import { useEffect, useState } from "react";

/**
 * FIX-V (блок 2) + П3: общий резолвер позиции якоря для toast-viewport.
 * П3: приоритет — плавающий тулбар канваса (.diagramActionBar): событийные
 * тосты уходят строго под его bottom и не перекрывают «Шаблоны/Отчёты/…».
 * Fallback-цепочка для надёжности: notification anchor → правый слот хедера
 * (исторический порядок сохранён для процессов без плавающего тулбара).
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

  const diagramToolbar = readRect(
    document.querySelector(".diagramActionBar"),
    "diagram-toolbar",
  );
  if (diagramToolbar) return diagramToolbar;

  const headerAnchor = readRect(
    document.querySelector('[data-testid="diagram-toolbar-notification-anchor"]'),
    "header-anchor",
  );
  if (headerAnchor) return headerAnchor;

  return readRect(
    document.querySelector(".diagramToolbarSlot--right"),
    "header-slot",
  );
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
