import { useCallback, useEffect, useMemo, useState } from "react";

function toText(value) {
  return String(value || "").trim();
}

export default function useDiagramShellState({
  tab,
  processBodyRef,
  setGenErr,
  shortErr,
}) {
  const [diagramFocusMode, setDiagramFocusMode] = useState(false);
  const [diagramFullscreenActive, setDiagramFullscreenActive] = useState(false);

  useEffect(() => {
    if (tab === "diagram") return;
    setDiagramFocusMode(false);
    if (typeof document !== "undefined" && document.fullscreenElement === processBodyRef.current) {
      void document.exitFullscreen().catch(() => {});
    }
    setDiagramFullscreenActive(false);
  }, [processBodyRef, tab]);

  useEffect(() => {
    if (!diagramFocusMode) return undefined;
    const onKeyDown = (event) => {
      if (String(event?.key || "") !== "Escape") return;
      setDiagramFocusMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [diagramFocusMode]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onFullscreenChange = () => {
      setDiagramFullscreenActive(document.fullscreenElement === processBodyRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [processBodyRef]);

  const toggleDiagramFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return false;
    const host = processBodyRef.current;
    if (!host || typeof host.requestFullscreen !== "function") {
      setGenErr?.("Fullscreen недоступен в этом окружении.");
      return false;
    }
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen();
        setDiagramFullscreenActive(false);
        return true;
      }
      await host.requestFullscreen();
      setDiagramFullscreenActive(true);
      return true;
    } catch (error) {
      setGenErr?.(shortErr?.(error?.message || error || "Не удалось переключить fullscreen.")
        || toText(error?.message || error)
        || "Не удалось переключить fullscreen.");
      return false;
    }
  }, [processBodyRef, setGenErr, shortErr]);

  const shellClassName = useMemo(
    () => [
      tab === "diagram" && diagramFocusMode ? "processShell--diagramFocus" : "",
      tab === "diagram" && diagramFullscreenActive ? "processShell--diagramFullscreen" : "",
    ].filter(Boolean).join(" "),
    [diagramFocusMode, diagramFullscreenActive, tab],
  );

  const bodyClassName = useMemo(
    () => `processBody relative ${tab === "diagram" && diagramFocusMode ? "processBody--diagramFocus" : ""}`,
    [diagramFocusMode, tab],
  );

  return {
    diagramFocusMode,
    setDiagramFocusMode,
    diagramFullscreenActive,
    setDiagramFullscreenActive,
    toggleDiagramFullscreen,
    shellClassName,
    bodyClassName,
  };
}
