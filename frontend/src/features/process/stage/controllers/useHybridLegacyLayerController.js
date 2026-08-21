import { useCallback } from "react";

export default function useHybridLegacyLayerController({
  user,
  hybridStorageKey,
  hybridUiPrefs,
  hybridVisible,
  hybridModeEffective,
  selectedElementId,
  draft,
  bpmnRef,
  bpmnStageHostRef,
  hybridTools,
  hybridLayerByElementId,
  hybridLayerMapRef,
  hybridLayerRenderRows,
  hybridLayerMissingBindingIds,
  hybridLayerActiveElementId,
  hybridV2DocRef,
  hybridV2DocLive,
  hybridV2BindingByHybridId,
  resolveFirstHybridSeedElementId,
  resolveHybridTargetElementIdFromPoint,
  readHybridElementAnchor,
  setHybridUiPrefs,
  setHybridPeekActive,
  setHybridV2BindPickMode,
  setHybridLayerByElementId,
  setHybridLayerActiveElementId,
  setHybridV2ActiveId,
  markPlaybackOverlayInteraction,
  persistHybridLayerMap,
  clientToDiagram,
  hybridLayerDragRef,
  toText,
  toNodeId,
  asArray,
  asObject,
  normalizeHybridUiPrefs,
  saveHybridUiPrefs,
  applyHybridVisibilityTransition,
  applyHybridModeTransition,
  normalizeHybridV2Doc,
  normalizeHybridLayerMap,
  parseSequenceFlowsFromXml,
}) {
  const updateHybridUiPrefs = useCallback((mutator) => {
    setHybridUiPrefs((prevRaw) => {
      const prev = normalizeHybridUiPrefs(prevRaw);
      const next = typeof mutator === "function" ? mutator(prev) : prev;
      const normalized = normalizeHybridUiPrefs(next);
      if (typeof window !== "undefined") {
        saveHybridUiPrefs(window.localStorage, hybridStorageKey, normalized, toText(user?.id));
      }
      return normalized;
    });
  }, [hybridStorageKey, normalizeHybridUiPrefs, saveHybridUiPrefs, setHybridUiPrefs, toText, user?.id]);

  const addOrSelectHybridMarker = useCallback((elementIdRaw, source = "hybrid_edit_click") => {
    const elementId = toNodeId(elementIdRaw);
    if (!elementId) return;
    let createdMap = null;
    setHybridLayerActiveElementId(elementId);
    setHybridLayerByElementId((prevRaw) => {
      const prev = normalizeHybridLayerMap(prevRaw);
      if (prev[elementId]) return prev;
      const next = {
        ...prev,
        [elementId]: { dx: 0, dy: 0 },
      };
      hybridLayerMapRef.current = next;
      markPlaybackOverlayInteraction({
        stage: "hybrid_marker_added",
        source,
        elementId,
      });
      createdMap = next;
      return next;
    });
    if (createdMap) {
      window.setTimeout(() => {
        void persistHybridLayerMap(createdMap, { source: `${source}_create` });
      }, 0);
    }
  }, [
    hybridLayerMapRef,
    markPlaybackOverlayInteraction,
    normalizeHybridLayerMap,
    persistHybridLayerMap,
    setHybridLayerActiveElementId,
    setHybridLayerByElementId,
    toNodeId,
  ]);

  const showHybridLayer = useCallback(() => {
    updateHybridUiPrefs((prev) => applyHybridVisibilityTransition(prev, true));
  }, [applyHybridVisibilityTransition, updateHybridUiPrefs]);

  const hideHybridLayer = useCallback(() => {
    updateHybridUiPrefs((prev) => applyHybridVisibilityTransition(prev, false));
    setHybridPeekActive(false);
    setHybridV2BindPickMode(false);
    hybridTools.cancelTransientState();
  }, [applyHybridVisibilityTransition, hybridTools, setHybridPeekActive, setHybridV2BindPickMode, updateHybridUiPrefs]);

  const setHybridLayerMode = useCallback((modeRaw, options = {}) => {
    const nextMode = toText(modeRaw).toLowerCase() === "edit" ? "edit" : "view";
    const skipV2Seed = !!options?.skipV2Seed;
    const skipLegacySeed = !!options?.skipLegacySeed;
    updateHybridUiPrefs((prev) => applyHybridModeTransition(prev, nextMode));
    hybridTools.updateDoc((prev) => ({
      ...prev,
      view: {
        ...asObject(prev.view),
        mode: nextMode,
      },
    }), "hybrid_v2_mode_change");
    if (nextMode !== "edit") return;
    const initialV2Count = Number(asArray(hybridV2DocRef.current?.elements).length || 0)
      + Number(asArray(hybridV2DocRef.current?.edges).length || 0);
    if (!skipV2Seed && initialV2Count <= 0) {
      const selectedIdForV2 = toNodeId(selectedElementId);
      if (selectedIdForV2) {
        const anchor = asObject(readHybridElementAnchor(selectedIdForV2));
        const point = Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
          ? { x: Number(anchor.x || 0), y: Number(anchor.y || 0) }
          : { x: 260, y: 220 };
        const createdId = hybridTools.createElementAt(point, "note");
        if (createdId) {
          hybridTools.bindHybridToBpmn(selectedIdForV2, createdId);
          return;
        }
      }
    }
    if (Number(asArray(hybridV2DocRef.current?.elements).length || 0) + Number(asArray(hybridV2DocRef.current?.edges).length || 0) > 0) {
      return;
    }
    if (skipLegacySeed) return;
    const currentMap = normalizeHybridLayerMap(hybridLayerMapRef.current);
    if (Object.keys(currentMap).length > 0) return;
    const selectedId = toNodeId(selectedElementId);
    if (selectedId) {
      addOrSelectHybridMarker(selectedId, "hybrid_edit_seed_selected");
      return;
    }
    const domSelectedId = (() => {
      const host = bpmnStageHostRef.current;
      if (!host) return "";
      const selectedNode = host.querySelector(
        "g.djs-element.selected[data-element-id], g.djs-shape.selected[data-element-id]",
      );
      return toNodeId(selectedNode?.getAttribute?.("data-element-id"));
    })();
    if (domSelectedId) {
      addOrSelectHybridMarker(domSelectedId, "hybrid_edit_seed_dom_selected");
      return;
    }
    const graphSeedId = (() => {
      const graphRes = asObject(bpmnRef.current?.getPlaybackGraph?.());
      const nodesById = asObject(asObject(graphRes?.graph).nodesById);
      const nodeIds = Object.keys(nodesById);
      for (let i = 0; i < nodeIds.length; i += 1) {
        const nodeId = toNodeId(nodeIds[i]);
        const node = asObject(nodesById[nodeId]);
        const type = toText(node?.type).toLowerCase();
        if (!nodeId) continue;
        if (type.includes("startevent") || type.includes("endevent") || type.includes("lane") || type.includes("participant")) continue;
        return nodeId;
      }
      return "";
    })();
    if (graphSeedId) {
      addOrSelectHybridMarker(graphSeedId, "hybrid_edit_seed_graph");
      return;
    }
    const domSeedId = resolveFirstHybridSeedElementId();
    if (domSeedId) {
      addOrSelectHybridMarker(domSeedId, "hybrid_edit_seed_dom");
      return;
    }
    const xmlSeedId = parseSequenceFlowsFromXml(draft?.bpmn_xml)
      .map((flowRaw) => toNodeId(asObject(flowRaw)?.targetId || asObject(flowRaw)?.sourceId))
      .find((nodeIdRaw) => {
        const nodeId = toNodeId(nodeIdRaw);
        const lowered = nodeId.toLowerCase();
        if (!nodeId) return false;
        if (lowered.includes("startevent") || lowered.includes("endevent") || lowered.includes("lane") || lowered.includes("participant")) return false;
        return true;
      });
    if (xmlSeedId) {
      addOrSelectHybridMarker(xmlSeedId, "hybrid_edit_seed_xml");
      return;
    }
    const fallbackNode = asArray(draft?.nodes).find((rowRaw) => {
      const row = asObject(rowRaw);
      const nodeId = toNodeId(row?.id);
      if (!nodeId) return false;
      const type = toText(row?.type).toLowerCase();
      if (type.includes("startevent") || type.includes("endevent")) return false;
      return true;
    });
    const fallbackId = toNodeId(asObject(fallbackNode)?.id);
    if (!fallbackId) return;
    addOrSelectHybridMarker(fallbackId, "hybrid_edit_seed_fallback");
  }, [
    addOrSelectHybridMarker,
    applyHybridModeTransition,
    asArray,
    asObject,
    bpmnRef,
    bpmnStageHostRef,
    draft?.bpmn_xml,
    draft?.nodes,
    hybridLayerMapRef,
    hybridTools,
    hybridV2DocRef,
    normalizeHybridLayerMap,
    parseSequenceFlowsFromXml,
    readHybridElementAnchor,
    resolveFirstHybridSeedElementId,
    selectedElementId,
    toNodeId,
    toText,
    updateHybridUiPrefs,
  ]);

  const toggleHybridToolsVisible = useCallback(() => {
    if (hybridVisible) {
      hideHybridLayer();
      return;
    }
    showHybridLayer();
  }, [hideHybridLayer, hybridVisible, showHybridLayer]);

  const setHybridLayerOpacity = useCallback((opacityRaw) => {
    const opacity = Number(opacityRaw || 60);
    updateHybridUiPrefs((prev) => ({
      ...prev,
      opacity: opacity >= 95 ? 100 : opacity >= 45 ? 60 : 30,
    }));
  }, [updateHybridUiPrefs]);

  const toggleHybridLayerLock = useCallback(() => {
    updateHybridUiPrefs((prev) => ({ ...prev, lock: !prev.lock }));
  }, [updateHybridUiPrefs]);

  const toggleHybridLayerFocus = useCallback(() => {
    updateHybridUiPrefs((prev) => ({ ...prev, focus: !prev.focus }));
  }, [updateHybridUiPrefs]);

  const toggleHybridV2LayerVisibility = useCallback((layerIdRaw) => {
    const layerId = toText(layerIdRaw);
    if (!layerId) return;
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const nextLayers = asArray(prev.layers).map((layerRaw) => {
        const layer = asObject(layerRaw);
        if (toText(layer.id) !== layerId) return layer;
        return {
          ...layer,
          visible: layer.visible === false,
        };
      });
      const activeLayerId = toText(asObject(prev.view).active_layer_id);
      const stillVisible = asArray(nextLayers).some((rowRaw) => {
        const row = asObject(rowRaw);
        return toText(row.id) === activeLayerId && row.visible !== false;
      });
      const firstVisibleLayerId = toText(asArray(nextLayers).find((rowRaw) => asObject(rowRaw).visible !== false)?.id);
      return {
        ...prev,
        layers: nextLayers,
        view: {
          ...asObject(prev.view),
          active_layer_id: stillVisible ? activeLayerId : (firstVisibleLayerId || activeLayerId || "L1"),
        },
      };
    }, "hybrid_v2_layer_visibility_toggle");
  }, [asArray, asObject, hybridTools, normalizeHybridV2Doc, toText]);

  const toggleHybridV2LayerLock = useCallback((layerIdRaw) => {
    const layerId = toText(layerIdRaw);
    if (!layerId) return;
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      return {
        ...prev,
        layers: asArray(prev.layers).map((layerRaw) => {
          const layer = asObject(layerRaw);
          if (toText(layer.id) !== layerId) return layer;
          return {
            ...layer,
            locked: layer.locked !== true,
          };
        }),
      };
    }, "hybrid_v2_layer_lock_toggle");
  }, [asArray, asObject, hybridTools, normalizeHybridV2Doc, toText]);

  const setHybridV2LayerOpacity = useCallback((layerIdRaw, opacityRaw) => {
    const layerId = toText(layerIdRaw);
    if (!layerId) return;
    const targetOpacity = Math.max(0.1, Math.min(1, Number(opacityRaw || 1)));
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      return {
        ...prev,
        layers: asArray(prev.layers).map((layerRaw) => {
          const layer = asObject(layerRaw);
          if (toText(layer.id) !== layerId) return layer;
          return {
            ...layer,
            opacity: targetOpacity,
          };
        }),
      };
    }, "hybrid_v2_layer_opacity_change");
  }, [asArray, asObject, hybridTools, normalizeHybridV2Doc, toText]);

  const revealAllHybridV2 = useCallback((source = "hybrid_v2_reveal_all") => {
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      return {
        ...prev,
        layers: asArray(prev.layers).map((layerRaw) => ({ ...asObject(layerRaw), visible: true })),
        elements: asArray(prev.elements).map((rowRaw) => ({ ...asObject(rowRaw), visible: true })),
        edges: asArray(prev.edges).map((rowRaw) => ({ ...asObject(rowRaw), visible: true })),
      };
    }, source);
  }, [asArray, asObject, hybridTools, normalizeHybridV2Doc]);

  const focusHybridLayer = useCallback((source = "hybrid_layer_focus") => {
    const rows = asArray(hybridLayerRenderRows);
    if (!rows.length && !asArray(hybridV2DocLive?.elements).length) return;
    if (!rows.length && asArray(hybridV2DocLive?.elements).length) {
      const first = asObject(hybridV2DocLive.elements[0]);
      const firstId = toText(first.id);
      if (!firstId) return;
      setHybridV2ActiveId(firstId);
      const binding = asObject(hybridV2BindingByHybridId[firstId]);
      const bpmnId = toText(binding.bpmn_id || binding.bpmnId);
      if (bpmnId) {
        bpmnRef.current?.focusNode?.(bpmnId, { keepPrevious: false, durationMs: 1200 });
      }
      return;
    }
    const target = asObject(rows.find((row) => !!asObject(row).hasCenter) || rows[0]);
    const elementId = toText(target?.elementId);
    if (!elementId) return;
    if (target?.hasCenter && !target?.insideViewport && (Math.abs(Number(target?.rawDx || 0)) > 0.5 || Math.abs(Number(target?.rawDy || 0)) > 0.5)) {
      let rebasedMap = null;
      setHybridLayerByElementId((prevRaw) => {
        const prev = normalizeHybridLayerMap(prevRaw);
        if (!prev[elementId]) return prev;
        const next = {
          ...prev,
          [elementId]: { dx: 0, dy: 0 },
        };
        hybridLayerMapRef.current = next;
        rebasedMap = next;
        return next;
      });
      if (rebasedMap) {
        window.setTimeout(() => {
          void persistHybridLayerMap(rebasedMap, { source: `${source}_rebase` });
        }, 0);
      }
    }
    setHybridLayerActiveElementId(elementId);
    markPlaybackOverlayInteraction({
      stage: "hybrid_layer_focus",
      source,
      elementId,
    });
    bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1400 });
  }, [
    asArray,
    asObject,
    bpmnRef,
    hybridLayerMapRef,
    hybridLayerRenderRows,
    hybridV2BindingByHybridId,
    hybridV2DocLive,
    markPlaybackOverlayInteraction,
    normalizeHybridLayerMap,
    persistHybridLayerMap,
    setHybridLayerActiveElementId,
    setHybridLayerByElementId,
    setHybridV2ActiveId,
    toText,
  ]);

  const goToHybridLayerItem = useCallback((elementIdRaw, source = "hybrid_layer_go_to") => {
    const elementId = toNodeId(elementIdRaw);
    if (!elementId) return;
    setHybridLayerActiveElementId(elementId);
    markPlaybackOverlayInteraction({
      stage: "hybrid_layer_go_to",
      source,
      elementId,
    });
    bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1200 });
  }, [bpmnRef, markPlaybackOverlayInteraction, setHybridLayerActiveElementId, toNodeId]);

  const cleanupMissingHybridBindings = useCallback((source = "hybrid_layer_cleanup_missing") => {
    const missingIds = new Set(asArray(hybridLayerMissingBindingIds).map((row) => toText(row)).filter(Boolean));
    if (!missingIds.size) return;
    let nextMap = null;
    setHybridLayerByElementId((prevRaw) => {
      const prev = normalizeHybridLayerMap(prevRaw);
      const next = {};
      Object.keys(prev).forEach((elementIdRaw) => {
        const elementId = toText(elementIdRaw);
        if (!elementId || missingIds.has(elementId)) return;
        next[elementId] = asObject(prev[elementId]);
      });
      hybridLayerMapRef.current = next;
      nextMap = next;
      return next;
    });
    if (nextMap) {
      window.setTimeout(() => {
        void persistHybridLayerMap(nextMap, { source });
      }, 0);
    }
    if (toText(hybridLayerActiveElementId) && missingIds.has(toText(hybridLayerActiveElementId))) {
      setHybridLayerActiveElementId("");
    }
    markPlaybackOverlayInteraction({
      stage: "hybrid_layer_cleanup_missing",
      count: missingIds.size,
      source,
    });
  }, [
    asArray,
    asObject,
    hybridLayerActiveElementId,
    hybridLayerMapRef,
    hybridLayerMissingBindingIds,
    markPlaybackOverlayInteraction,
    normalizeHybridLayerMap,
    persistHybridLayerMap,
    setHybridLayerActiveElementId,
    setHybridLayerByElementId,
    toText,
  ]);

  const withHybridOverlayGuard = useCallback((event, meta = {}) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    markPlaybackOverlayInteraction({ stage: "hybrid_overlay_guard", ...asObject(meta) });
  }, [asObject, markPlaybackOverlayInteraction]);

  const handleHybridLayerItemPointerDown = useCallback((event, itemRaw) => {
    const item = asObject(itemRaw);
    const elementId = toText(item?.elementId);
    if (!elementId) return;
    withHybridOverlayGuard(event, { elementId, action: "item_pointer_down" });
    setHybridLayerActiveElementId(elementId);
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
    const row = asObject(hybridLayerByElementId[elementId]);
    const pointer = clientToDiagram(event?.clientX, event?.clientY);
    if (!pointer) return;
    hybridLayerDragRef.current = {
      elementId,
      startX: Number(pointer.x || 0),
      startY: Number(pointer.y || 0),
      baseDx: Number(row.dx || 0),
      baseDy: Number(row.dy || 0),
    };
  }, [
    asObject,
    clientToDiagram,
    hybridLayerByElementId,
    hybridLayerDragRef,
    hybridModeEffective,
    hybridUiPrefs.lock,
    setHybridLayerActiveElementId,
    toText,
    withHybridOverlayGuard,
  ]);

  const handleHybridEditSurfacePointerDown = useCallback((event, source = "hybrid_edit_surface") => {
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
    const elementId = resolveHybridTargetElementIdFromPoint(event?.clientX, event?.clientY) || toNodeId(selectedElementId);
    withHybridOverlayGuard(event, { action: source, elementId });
    if (!elementId) return;
    addOrSelectHybridMarker(elementId, source);
  }, [
    addOrSelectHybridMarker,
    hybridModeEffective,
    hybridUiPrefs.lock,
    resolveHybridTargetElementIdFromPoint,
    selectedElementId,
    toNodeId,
    withHybridOverlayGuard,
  ]);

  return {
    showHybridLayer,
    hideHybridLayer,
    setHybridLayerMode,
    toggleHybridToolsVisible,
    setHybridLayerOpacity,
    toggleHybridLayerLock,
    toggleHybridLayerFocus,
    toggleHybridV2LayerVisibility,
    toggleHybridV2LayerLock,
    setHybridV2LayerOpacity,
    revealAllHybridV2,
    focusHybridLayer,
    goToHybridLayerItem,
    cleanupMissingHybridBindings,
    withHybridOverlayGuard,
    handleHybridLayerItemPointerDown,
    addOrSelectHybridMarker,
    handleHybridEditSurfacePointerDown,
  };
}
