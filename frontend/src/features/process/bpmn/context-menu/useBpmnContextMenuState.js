import { useCallback, useEffect, useState } from "react";

export default function useBpmnContextMenuState({
  isBlocked = false,
  modalOpenSignal = false,
  closeAllDiagramActions,
} = {}) {
  const [menu, setMenu] = useState(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openMenu = useCallback((nextMenu) => {
    if (!nextMenu || typeof nextMenu !== "object") return false;
    closeAllDiagramActions?.();
    setMenu(nextMenu);
    return true;
  }, [closeAllDiagramActions]);

  useEffect(() => {
    if (!menu) return undefined;
    const onPointerDown = () => setMenu(null);
    const onKeyDown = (event) => {
      if (String(event?.key || "") !== "Escape") return;
      setMenu(null);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    if (isBlocked) setMenu(null);
  }, [isBlocked, menu]);

  useEffect(() => {
    if (!menu) return;
    if (modalOpenSignal) setMenu(null);
  }, [menu, modalOpenSignal]);

  useEffect(() => {
    if (!menu || typeof window === "undefined") return undefined;
    const onRouteLikeChange = () => setMenu(null);

    window.addEventListener("popstate", onRouteLikeChange);
    window.addEventListener("hashchange", onRouteLikeChange);
    return () => {
      window.removeEventListener("popstate", onRouteLikeChange);
      window.removeEventListener("hashchange", onRouteLikeChange);
    };
  }, [menu]);

  return {
    menu,
    openMenu,
    closeMenu,
  };
}
