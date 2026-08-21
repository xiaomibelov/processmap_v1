import { useEffect } from "react";

import {
  asObject,
  collectDrawioElementIdsFromTarget,
  resolveDrawioPointerElementId,
} from "./drawioOverlayState.js";
import { traceDrawioRuntime } from "./drawioRuntimeProbes.js";
import { shouldBlockBpmnClickDrawioCreation } from "./drawioCreateGuard.js";

export default function useDrawioPointerStartBinding({
  rootRef,
  hasRenderable,
  metaRef,
  layerMap,
  elementMap,
  dragRef,
  screenToDiagramRef,
  onCreateElement,
  selectedIdRef,
  selectElement,
  clearSelection,
  startDragByElementId,
}) {
  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof Element) || !hasRenderable) return undefined;
    const handleStart = (event) => {
      const target = event?.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.dataset?.drawioResizeHandle) return;
      const idChain = collectDrawioElementIdsFromTarget(target, root);
      const meta = metaRef.current;
      const hitId = resolveDrawioPointerElementId(target, root, meta, layerMap, elementMap);
      traceDrawioRuntime("drawio_pointerdown", {
        hitId,
        idChain,
        pointerId: Number(event?.pointerId ?? Number.NaN),
      });
      if (hitId) {
        startDragByElementId(event, hitId);
        return;
      }
      const blockCreate = shouldBlockBpmnClickDrawioCreation({
        enabled: meta?.enabled === true,
        locked: meta?.locked === true,
        interactionMode: meta?.interaction_mode,
        toolId: meta?.active_tool,
      });
      if (!blockCreate) {
        const screenToDiagram = typeof screenToDiagramRef?.current === "function" ? screenToDiagramRef.current : null;
        const point = screenToDiagram
          ? screenToDiagram(Number(event?.clientX || 0), Number(event?.clientY || 0))
          : null;
        if (point && typeof onCreateElement === "function") {
          event.preventDefault();
          event.stopPropagation();
          const createdId = String(onCreateElement({
            toolId: String(meta?.active_tool || ""),
            x: Number(point.x || 0),
            y: Number(point.y || 0),
          }) || "").trim();
          traceDrawioRuntime("drawio_runtime_create_attempt", {
            mode: String(meta?.interaction_mode || ""),
            toolId: String(meta?.active_tool || ""),
            x: Number(point.x || 0),
            y: Number(point.y || 0),
            createdId,
          });
          if (createdId) {
            selectElement(createdId, "runtime_create");
            return;
          }
        }
        traceDrawioRuntime("drawio_create_path_allowed_but_create_failed", {
          mode: String(meta?.interaction_mode || ""),
          toolId: String(meta?.active_tool || ""),
        });
      }
      if (!selectedIdRef.current) return;
      clearSelection("pointer_clear");
    };
    const onPointerDown = (event) => {
      handleStart(event);
    };
    const onMouseDown = (event) => {
      const state = asObject(dragRef.current);
      if (state.id) return;
      handleStart(event);
    };
    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("mousedown", onMouseDown, true);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [
    clearSelection,
    dragRef,
    elementMap,
    hasRenderable,
    layerMap,
    metaRef,
    onCreateElement,
    rootRef,
    screenToDiagramRef,
    selectedIdRef,
    selectElement,
    startDragByElementId,
  ]);
}
