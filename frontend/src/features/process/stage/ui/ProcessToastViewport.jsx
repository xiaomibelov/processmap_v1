import { useMemo } from "react";

import useDiagramToolbarAnchorRect from "./useDiagramToolbarAnchorRect.js";

const VIEWPORT_GAP_PX = 12;
const VIEWPORT_TOP_OFFSET_PX = 8;
const TOAST_VIEWPORT_MAX_WIDTH_PX = 420;
const TOAST_VIEWPORT_MIN_WIDTH_PX = 220;

/**
 * FIX-V (блок 2, U1/U2): единый toast-viewport процесс-стейджа.
 *
 * - Все тосты (save-ack, hybrid persist и будущие) рендерятся ВЕРТИКАЛЬНЫМ
 *   СТЕКОМ в одном контейнере → не перекрывают друг друга.
 * - Контейнер позиционируется ПОД диаграмм-тулбаром (top = anchor.bottom + 8),
 *   правым краем к якорю → не перекрывает кнопки тулбара/хедера.
 * - Контейнер pointer-events-none: клики проходят сквозь пустые области;
 *   события ловит только карточка тоста (pointer-events-auto у детей).
 */
export default function ProcessToastViewport({
  visible = true,
  children = null,
} = {}) {
  const anchorRect = useDiagramToolbarAnchorRect(visible === true);

  const containerStyle = useMemo(() => {
    if (typeof window === "undefined") return null;
    const viewportWidth = Number(window.innerWidth || 0);
    const viewportHeight = Number(window.innerHeight || 0);
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;

    const width = Math.max(
      TOAST_VIEWPORT_MIN_WIDTH_PX,
      Math.min(TOAST_VIEWPORT_MAX_WIDTH_PX, viewportWidth - VIEWPORT_GAP_PX * 2),
    );
    if (!anchorRect) {
      // Fallback без якоря: правый верхний угол под предполагаемым хедером.
      return {
        position: "fixed",
        right: `${VIEWPORT_GAP_PX}px`,
        top: `${VIEWPORT_GAP_PX + 56}px`,
        width: `${width}px`,
      };
    }
    const left = Math.max(
      VIEWPORT_GAP_PX,
      Math.min(anchorRect.right - width, viewportWidth - VIEWPORT_GAP_PX - width),
    );
    const top = Math.min(
      viewportHeight - VIEWPORT_GAP_PX,
      Math.max(VIEWPORT_GAP_PX, anchorRect.bottom + VIEWPORT_TOP_OFFSET_PX),
    );
    return {
      position: "fixed",
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
    };
  }, [anchorRect]);

  if (visible !== true) return null;

  return (
    <div
      className="pointer-events-none fixed z-[130] flex w-[min(92vw,420px)] flex-col items-end gap-2"
      style={containerStyle || undefined}
      data-testid="process-toast-viewport"
    >
      {children}
    </div>
  );
}
