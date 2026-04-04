import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function resolveMenuStartPosition(menu) {
  const x = Number(menu?.clientX || 0);
  const y = Number(menu?.clientY || 0);
  if (typeof window === "undefined") return { left: x, top: y };
  const maxLeft = Math.max(8, Number(window.innerWidth || 0) - 8);
  const maxTop = Math.max(8, Number(window.innerHeight || 0) - 8);
  return {
    left: clamp(Math.round(x), 8, maxLeft),
    top: clamp(Math.round(y), 8, maxTop),
  };
}

export default function useBpmnContextMenuPosition({
  menu,
  reflowKey = "",
} = {}) {
  const menuRef = useRef(null);
  const posSeed = resolveMenuStartPosition(menu);
  const [pos, setPos] = useState(posSeed);

  useEffect(() => {
    setPos(posSeed);
  }, [menu?.sessionId, menu?.clientX, menu?.clientY, menu?.target?.id, posSeed.left, posSeed.top]);

  const clampMenuPosition = useCallback(() => {
    const node = menuRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const width = Math.max(1, Number(rect.width || 0));
    const height = Math.max(1, Number(rect.height || 0));
    const vw = Number(window.innerWidth || 0);
    const vh = Number(window.innerHeight || 0);
    const maxLeft = Math.max(8, vw - width - 8);
    const maxTop = Math.max(8, vh - height - 8);
    setPos((prev) => {
      const next = {
        left: clamp(Math.round(Number(prev?.left || 0)), 8, maxLeft),
        top: clamp(Math.round(Number(prev?.top || 0)), 8, maxTop),
      };
      if (next.left === prev.left && next.top === prev.top) return prev;
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    clampMenuPosition();
  }, [clampMenuPosition, reflowKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => clampMenuPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampMenuPosition]);

  return {
    menuRef,
    pos,
  };
}

