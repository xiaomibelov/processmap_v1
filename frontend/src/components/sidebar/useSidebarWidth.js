import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "processmap_sidebar_width";
const MIN_WIDTH = 300;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 380;

function clampWidth(value) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value));
}

export default function useSidebarWidth() {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH;
  });

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function getClientX(event) {
      if (event.touches && event.touches.length > 0) {
        return event.touches[0].clientX;
      }
      return event.clientX;
    }

    function handleMove(event) {
      if (!isDraggingRef.current) return;
      const delta = getClientX(event) - startXRef.current;
      setWidth(clampWidth(startWidthRef.current + delta));
    }

    function handleEnd() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(STORAGE_KEY, String(width));
    }

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [width]);

  const startDragging = useCallback((event) => {
    isDraggingRef.current = true;
    startXRef.current = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    startWidthRef.current = width;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  return { width, startDragging };
}
