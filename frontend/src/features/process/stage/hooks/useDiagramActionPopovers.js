import { useCallback, useEffect } from "react";

export default function useDiagramActionPopovers({
  toolbarMenuOpen,
  setToolbarMenuOpen,
  diagramActionPathOpen,
  setDiagramActionPathOpen,
  diagramActionHybridToolsOpen,
  setDiagramActionHybridToolsOpen,
  diagramActionPlanOpen,
  setDiagramActionPlanOpen,
  diagramActionPlaybackOpen,
  setDiagramActionPlaybackOpen,
  diagramActionLayersOpen,
  setDiagramActionLayersOpen,
  diagramActionRobotMetaOpen,
  setDiagramActionRobotMetaOpen,
  diagramActionSearchOpen,
  setDiagramActionSearchOpen,
  robotMetaListOpen,
  setRobotMetaListOpen,
  setRobotMetaListSearch,
  diagramActionQualityOpen,
  setDiagramActionQualityOpen,
  diagramActionOverflowOpen,
  setDiagramActionOverflowOpen,
  toolbarMenuRef,
  toolbarMenuButtonRef,
  diagramActionBarRef,
  diagramPathPopoverRef,
  diagramHybridToolsPopoverRef,
  diagramPlanPopoverRef,
  diagramPlaybackPopoverRef,
  diagramLayersPopoverRef,
  diagramRobotMetaPopoverRef,
  diagramRobotMetaListRef,
  diagramSearchPopoverRef,
  diagramQualityPopoverRef,
  diagramOverflowPopoverRef,
  hybridLayerOverlayRef,
  playbackOverlayClickGuardRef,
  logPlaybackDebug,
  toText,
}) {
  const closeAllDiagramActions = useCallback(() => {
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setDiagramActionSearchOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
  }, [
    setDiagramActionHybridToolsOpen,
    setDiagramActionLayersOpen,
    setDiagramActionOverflowOpen,
    setDiagramActionPathOpen,
    setDiagramActionPlanOpen,
    setDiagramActionPlaybackOpen,
    setDiagramActionQualityOpen,
    setDiagramActionSearchOpen,
    setDiagramActionRobotMetaOpen,
    setRobotMetaListOpen,
  ]);

  useEffect(() => {
    if (!toolbarMenuOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event?.target;
      const menuEl = toolbarMenuRef.current;
      const btnEl = toolbarMenuButtonRef.current;
      const insideMenu = !!(menuEl && target instanceof Node && menuEl.contains(target));
      const insideBtn = !!(btnEl && target instanceof Node && btnEl.contains(target));
      if (insideMenu || insideBtn) return;
      setToolbarMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setToolbarMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setToolbarMenuOpen, toolbarMenuButtonRef, toolbarMenuOpen, toolbarMenuRef]);

  useEffect(() => {
    if (!diagramActionPathOpen
      && !diagramActionHybridToolsOpen
      && !diagramActionPlanOpen
      && !diagramActionPlaybackOpen
      && !diagramActionLayersOpen
      && !diagramActionRobotMetaOpen
      && !diagramActionSearchOpen
      && !diagramActionQualityOpen
      && !diagramActionOverflowOpen
      && !robotMetaListOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (playbackOverlayClickGuardRef.current) {
        logPlaybackDebug("outside_click_ignored", {
          reason: "playback_overlay_guard",
          targetClass: toText(target?.className),
        });
        return;
      }
      if (target instanceof Element && target.closest?.("[data-playback-overlay='gateway']")) {
        logPlaybackDebug("outside_click_ignored", {
          reason: "playback_overlay_node",
          targetClass: toText(target?.className),
        });
        return;
      }
      const refs = [
        diagramActionBarRef.current,
        diagramPathPopoverRef.current,
        diagramHybridToolsPopoverRef.current,
        diagramPlanPopoverRef.current,
        diagramPlaybackPopoverRef.current,
        diagramLayersPopoverRef.current,
        diagramRobotMetaPopoverRef.current,
        diagramRobotMetaListRef.current,
        diagramSearchPopoverRef.current,
        diagramQualityPopoverRef.current,
        diagramOverflowPopoverRef.current,
        hybridLayerOverlayRef.current,
      ];
      const inside = refs.some((node) => !!(node && target instanceof Node && node.contains(target)));
      if (inside) return;
      closeAllDiagramActions();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      closeAllDiagramActions();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    closeAllDiagramActions,
    diagramActionBarRef,
    diagramActionHybridToolsOpen,
    diagramActionLayersOpen,
    diagramActionOverflowOpen,
    diagramActionPathOpen,
    diagramActionPlanOpen,
    diagramActionPlaybackOpen,
    diagramActionQualityOpen,
    diagramActionSearchOpen,
    diagramActionRobotMetaOpen,
    diagramHybridToolsPopoverRef,
    diagramLayersPopoverRef,
    diagramOverflowPopoverRef,
    diagramPathPopoverRef,
    diagramPlanPopoverRef,
    diagramPlaybackPopoverRef,
    diagramQualityPopoverRef,
    diagramRobotMetaListRef,
    diagramRobotMetaPopoverRef,
    diagramSearchPopoverRef,
    hybridLayerOverlayRef,
    logPlaybackDebug,
    playbackOverlayClickGuardRef,
    robotMetaListOpen,
    toText,
  ]);

  useEffect(() => {
    if (diagramActionRobotMetaOpen) return;
    setRobotMetaListOpen(false);
    setRobotMetaListSearch("");
  }, [diagramActionRobotMetaOpen, setRobotMetaListOpen, setRobotMetaListSearch]);

  return { closeAllDiagramActions };
}
