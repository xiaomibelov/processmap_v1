import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const WINDOW_THRESHOLD = 50;
export const ROW_HEIGHT_ESTIMATE = 132;
export const WINDOW_OVERSCAN = 6;

export function useWindowedList(items, {
  threshold = WINDOW_THRESHOLD,
  rowHeight = ROW_HEIGHT_ESTIMATE,
  overscan = WINDOW_OVERSCAN,
} = {}) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (resizeObserver) resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  const windowed = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    if (list.length <= threshold) {
      return {
        enabled: false,
        start: 0,
        end: list.length,
        topSpacer: 0,
        bottomSpacer: 0,
        totalHeight: 0,
      };
    }
    const totalHeight = list.length * rowHeight;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const end = Math.min(list.length, start + Math.max(visibleCount, 1));
    return {
      enabled: true,
      start,
      end,
      topSpacer: start * rowHeight,
      bottomSpacer: (list.length - end) * rowHeight,
      totalHeight,
    };
  }, [items, threshold, rowHeight, overscan, scrollTop, viewportHeight]);

  const resetScroll = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, []);

  return { scrollRef, ...windowed, resetScroll };
}
