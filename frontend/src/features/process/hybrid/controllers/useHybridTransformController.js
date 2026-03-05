import { useEffect } from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useHybridTransformController({
  clientToDiagram,
  modeEffective,
  uiLocked,
  dragRef,
  resizeRef,
  queueElementTransform,
  flushPendingTransform,
  hybridDocRef,
  persistHybridV2Doc,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (modeEffective !== "edit" || uiLocked) return undefined;
    const onMove = (event) => {
      const drag = asObject(dragRef?.current);
      const resize = asObject(resizeRef?.current);
      if (!drag.id && !resize.id) return;
      const point = clientToDiagram(event?.clientX, event?.clientY);
      if (!point) return;
      if (drag.id) {
        const computeRect = typeof drag.computeRect === "function" ? drag.computeRect : null;
        const nextRect = computeRect
          ? computeRect(point)
          : {
            x: Number(drag.baseX || 0) + (Number(point.x || 0) - Number(drag.startX || 0)),
            y: Number(drag.baseY || 0) + (Number(point.y || 0) - Number(drag.startY || 0)),
            w: Number(drag.baseW || 0),
            h: Number(drag.baseH || 0),
          };
        queueElementTransform(
          drag.id,
          nextRect,
          "hybrid_v2_drag_move",
        );
      } else if (resize.id) {
        const computeRect = typeof resize.computeRect === "function" ? resize.computeRect : null;
        const nextRect = computeRect ? computeRect(point) : null;
        if (!nextRect) return;
        queueElementTransform(
          resize.id,
          nextRect,
          "hybrid_v2_resize_move",
        );
      }
    };
    const onUp = () => {
      const hadDrag = !!asObject(dragRef?.current).id;
      const hadResize = !!asObject(resizeRef?.current).id;
      flushPendingTransform(hadResize ? "hybrid_v2_resize_move" : "hybrid_v2_drag_move");
      if (dragRef) dragRef.current = null;
      if (resizeRef) resizeRef.current = null;
      if (!hadDrag && !hadResize) return;
      void persistHybridV2Doc?.(hybridDocRef?.current, { source: hadResize ? "hybrid_v2_resize_end" : "hybrid_v2_drag_end" });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    clientToDiagram,
    dragRef,
    flushPendingTransform,
    hybridDocRef,
    modeEffective,
    persistHybridV2Doc,
    queueElementTransform,
    resizeRef,
    uiLocked,
  ]);
}
