import { useCallback, useEffect, useMemo } from "react";
import { deleteHybridIds } from "../actions/hybridDelete.js";
import useHybridSelectionController from "./useHybridSelectionController.js";
import useHybridToolsController from "./useHybridToolsController.js";
import useHybridKeyboardController from "./useHybridKeyboardController.js";
import { applyHybridPaletteModeIntent, applyHybridPaletteToolIntent } from "../tools/hybridToolState.js";
import useHybridLegacyLayerController from "../../stage/controllers/useHybridLegacyLayerController.js";
import { migrateHybridV1ToV2 } from "../hybridLayerV2.js";
import {
  hasKnownHybridV2Session,
  serializeHybridLayerMap,
} from "../../stage/utils/processStageHelpers.js";
import { pushDeleteTrace } from "../../stage/utils/deleteTrace";

export default function useHybridPipelineController({
  sid,
  tab,
  draft,
  user,
  isLocal,
  selectedElementId,
  selectedElementType,
  diagramActionHybridToolsOpen,
  setDiagramActionHybridToolsOpen,
  hybridUiPrefs,
  setHybridUiPrefs,
  hybridPeekActive,
  setHybridPeekActive,
  hybridVisible,
  hybridModeEffective,
  hybridLayerByElementId,
  setHybridLayerByElementId,
  hybridLayerActiveElementId,
  setHybridLayerActiveElementId,
  hybridLayerMapRef,
  hybridLayerPersistedMapRef,
  hybridLayerDragRef,
  hybridAutoFocusGuardRef,
  hybridV2Doc,
  setHybridV2Doc,
  hybridV2DocRef,
  hybridV2PersistedDocRef,
  hybridV2BindPickMode,
  setHybridV2BindPickMode,
  hybridV2MigrationGuardRef,
  drawioMeta,
  hybridStorageKey,
  hybridLayerMapFromDraft,
  hybridLayerMapLive,
  hybridLayerRenderRows,
  hybridLayerMissingBindingIds,
  hybridLayerVisibilityStats,
  hybridLayerCounts,
  hybridViewportSize,
  hybridViewportMatrix,
  overlayViewbox,
  overlayContainerRect,
  clientToDiagram,
  resolveHybridTargetElementIdFromPoint,
  resolveFirstHybridSeedElementId,
  readHybridElementAnchor,
  getHybridLayerCardRefCallback,
  bpmnRef,
  bpmnStageHostRef,
  persistHybridLayerMap,
  persistHybridV2Doc,
  markPlaybackOverlayInteraction,
  playbackHighlightedBpmnIds,
  hybridDebugEnabled,
  normalizeHybridLayerMap,
  normalizeHybridUiPrefs,
  saveHybridUiPrefs,
  applyHybridVisibilityTransition,
  applyHybridModeTransition,
  normalizeHybridV2Doc,
  docToComparableJson,
  parseSequenceFlowsFromXml,
  toText,
  toNodeId,
  asArray,
  asObject,
  isEditableTarget,
  downloadTextFile,
  setGenErr,
  setInfoMsg,
}) {
  const applyHybridV2Delete = useCallback((idsRaw) => {
    const prev = normalizeHybridV2Doc(hybridV2DocRef.current);
    const ids = asArray(idsRaw).map((row) => toText(row)).filter(Boolean);
    if (!ids.length) return false;
    const layerById = {};
    asArray(prev.layers).forEach((layerRaw) => {
      const layer = asObject(layerRaw);
      const layerId = toText(layer.id);
      if (layerId) layerById[layerId] = layer;
    });
    const blockedLockedIds = ids.filter((id) => {
      const element = asObject(asArray(prev.elements).find((rowRaw) => toText(asObject(rowRaw).id) === id));
      if (element.id) return element.locked === true || asObject(layerById[toText(element.layer_id)]).locked === true;
      const edge = asObject(asArray(prev.edges).find((rowRaw) => toText(asObject(rowRaw).id) === id));
      if (edge.id) return edge.locked === true || asObject(layerById[toText(edge.layer_id)]).locked === true;
      return false;
    });
    if (blockedLockedIds.length) {
      setInfoMsg(`Удаление недоступно: слой заблокирован (${blockedLockedIds.join(", ")}).`);
      setGenErr("");
      return false;
    }
    const result = deleteHybridIds(prev, idsRaw);
    const next = normalizeHybridV2Doc(result.nextHybridV2);
    const changed = docToComparableJson(prev) !== docToComparableJson(next);
    if (!changed) {
      setInfoMsg("Нечего удалять: элемент не найден или уже удалён.");
      setGenErr("");
      return false;
    }
    hybridV2DocRef.current = next;
    setHybridV2Doc(next);
    markPlaybackOverlayInteraction({
      stage: "hybrid_v2_delete_item",
      count: Number(asArray(result.deleted.elements).length || 0) + Number(asArray(result.deleted.edges).length || 0),
      cleanedBindingsCount: Number(result.cleanedBindingsCount || 0),
    });
    setHybridV2BindPickMode(false);
    void persistHybridV2Doc(next, { source: "hybrid_v2_delete_item" });
    return changed;
  }, [
    asArray,
    asObject,
    docToComparableJson,
    hybridV2DocRef,
    markPlaybackOverlayInteraction,
    normalizeHybridV2Doc,
    persistHybridV2Doc,
    setGenErr,
    setHybridV2BindPickMode,
    setHybridV2Doc,
    setInfoMsg,
    toText,
  ]);

  const hybridTools = useHybridToolsController({
    hybridDoc: hybridV2Doc,
    setHybridDoc: setHybridV2Doc,
    hybridDocRef: hybridV2DocRef,
    hybridVisible,
    modeEffective: hybridModeEffective,
    uiLocked: hybridUiPrefs.lock,
    hybridViewportMatrix,
    clientToDiagram,
    overlayRect: overlayContainerRect,
    persistHybridV2Doc,
    sid,
    markPlaybackOverlayInteraction,
    bpmnRef,
    setBindPickMode: setHybridV2BindPickMode,
    setGenErr,
    setInfoMsg,
    downloadTextFile,
  });

  const hybridSelection = useHybridSelectionController({
    enabled: tab === "diagram" && hybridVisible,
    modeEffective: hybridModeEffective,
    uiLocked: hybridUiPrefs.lock,
    overlayRect: overlayContainerRect,
    renderable: hybridTools.renderable,
    docLive: hybridTools.docLive,
    isEditableTarget,
    onDeleteIds: applyHybridV2Delete,
    onRequestEditSelected: hybridTools.openTextEditor,
  });

  const hybridV2DocLive = hybridTools.docLive;
  const hybridV2BindingByHybridId = hybridTools.bindingByHybridId;
  const hybridV2Renderable = hybridTools.renderable;
  const hybridV2TotalCount = hybridTools.totalCount;
  const hybridV2HiddenCount = hybridTools.hiddenCount;
  const hybridV2ToolState = hybridTools.toolState;
  const hybridV2ActiveId = hybridSelection.primarySelectedId;
  const hybridV2SelectedIds = hybridSelection.selectedIds;
  const hybridV2SelectedIdSet = hybridSelection.selectedIdSet;
  const hybridV2ImportNotice = hybridTools.importNotice;
  const setHybridV2ActiveId = hybridSelection.selectOnly;
  const deleteSelectedHybridIds = hybridSelection.deleteSelected;
  const hybridTotalCount = Math.max(Number(hybridLayerCounts.total || 0), hybridV2TotalCount);
  const setHybridV2Tool = hybridTools.setTool;

  const {
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
  } = useHybridLegacyLayerController({
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
  });

  const hybridToolsUiState = useMemo(() => ({
    visible: hybridVisible,
    mode: hybridModeEffective,
    tool: hybridV2ToolState,
  }), [hybridModeEffective, hybridV2ToolState, hybridVisible]);

  const setHybridToolsMode = useCallback((modeRaw) => {
    const nextState = applyHybridPaletteModeIntent(hybridToolsUiState, modeRaw);
    showHybridLayer();
    setHybridLayerMode(nextState.mode);
  }, [hybridToolsUiState, setHybridLayerMode, showHybridLayer]);

  const selectHybridPaletteTool = useCallback((toolRaw) => {
    const nextState = applyHybridPaletteToolIntent(hybridToolsUiState, toolRaw);
    showHybridLayer();
    if (nextState.mode === "edit") {
      setHybridLayerMode("edit", {
        skipV2Seed: nextState.tool !== "select",
        skipLegacySeed: nextState.tool !== "select",
      });
    }
    setHybridV2Tool(nextState.tool);
  }, [hybridToolsUiState, setHybridLayerMode, setHybridV2Tool, showHybridLayer]);

  const bindActiveHybridV2ToBpmn = useCallback((targetBpmnIdRaw, hybridIdRaw = "") => {
    hybridTools.bindHybridToBpmn(targetBpmnIdRaw, hybridIdRaw || hybridSelection.primarySelectedId);
  }, [hybridSelection.primarySelectedId, hybridTools]);

  const goToActiveHybridBinding = useCallback(() => {
    hybridTools.goToHybridBinding(hybridSelection.primarySelectedId);
  }, [hybridSelection.primarySelectedId, hybridTools]);

  const exportHybridV2Drawio = hybridTools.exportDrawio;
  const handleHybridV2ImportFile = hybridTools.importFile;
  const handleHybridV2ElementPointerDown = useCallback((event, elementIdRaw) => {
    hybridTools.onElementPointerDown(event, elementIdRaw, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const handleHybridV2ResizeHandlePointerDown = useCallback((event, elementIdRaw, handleRaw) => {
    hybridTools.onResizeHandlePointerDown(event, elementIdRaw, handleRaw, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const handleHybridV2OverlayPointerDown = useCallback((event) => {
    hybridTools.onOverlayPointerDown(event, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const handleHybridV2OverlayContextMenu = useCallback((event) => {
    hybridTools.onOverlayContextMenu(event, hybridSelection.hitTestAtClientPoint);
  }, [hybridSelection.hitTestAtClientPoint, hybridTools]);
  const handleHybridV2ElementContextMenu = useCallback((event, elementIdRaw) => {
    if (!hybridV2SelectedIdSet.has(toText(elementIdRaw))) {
      hybridSelection.selectOnly(elementIdRaw);
    }
    hybridTools.onElementContextMenu(event, elementIdRaw);
  }, [hybridSelection, hybridTools, hybridV2SelectedIdSet, toText]);
  const handleHybridV2ElementDoubleClick = useCallback((event, elementIdRaw) => {
    hybridTools.onElementDoubleClick(event, elementIdRaw, hybridSelection);
  }, [hybridSelection, hybridTools]);

  const deleteLegacyHybridMarkers = useCallback((elementIdsRaw, source = "hybrid_legacy_delete") => {
    const elementIds = Array.from(new Set(asArray(elementIdsRaw).map((row) => toText(row)).filter(Boolean)));
    pushDeleteTrace("hybrid_legacy_delete_attempt", {
      elementIds,
      source,
      activeLegacyId: toText(hybridLayerActiveElementId),
    });
    if (!elementIds.length) return false;
    const boundHybridIds = new Set();
    elementIds.forEach((elementId) => {
      asArray(hybridTools.bindingByBpmnId[elementId]).forEach((bindingRaw) => {
        const binding = asObject(bindingRaw);
        const hybridId = toText(binding.hybrid_id || binding.hybridId);
        if (hybridId) boundHybridIds.add(hybridId);
      });
    });
    let nextMap = null;
    let removedCount = 0;
    setHybridLayerByElementId((prevRaw) => {
      const prev = normalizeHybridLayerMap(prevRaw);
      const next = {};
      Object.keys(prev).forEach((elementIdRaw) => {
        const elementId = toText(elementIdRaw);
        if (!elementId) return;
        if (elementIds.includes(elementId)) {
          removedCount += 1;
          return;
        }
        next[elementId] = asObject(prev[elementId]);
      });
      hybridLayerMapRef.current = next;
      nextMap = next;
      return next;
    });
    if (boundHybridIds.size) {
      applyHybridV2Delete(Array.from(boundHybridIds));
    }
    if (nextMap) {
      window.setTimeout(() => {
        void persistHybridLayerMap(nextMap, { source });
      }, 0);
    }
    if (elementIds.includes(toText(hybridLayerActiveElementId))) {
      setHybridLayerActiveElementId("");
    }
    const changed = removedCount > 0 || boundHybridIds.size > 0;
    pushDeleteTrace("hybrid_legacy_delete_result", {
      elementIds,
      source,
      removedCount,
      boundHybridCount: boundHybridIds.size,
      changed,
    });
    if (!changed) {
      setInfoMsg("Нечего удалять: legacy-метка не найдена.");
      setGenErr("");
      return false;
    }
    markPlaybackOverlayInteraction({
      stage: source,
      legacyCount: removedCount,
      hybridCount: boundHybridIds.size,
    });
    return true;
  }, [
    applyHybridV2Delete,
    asArray,
    asObject,
    hybridLayerActiveElementId,
    hybridLayerMapRef,
    hybridTools.bindingByBpmnId,
    markPlaybackOverlayInteraction,
    normalizeHybridLayerMap,
    persistHybridLayerMap,
    setGenErr,
    setHybridLayerActiveElementId,
    setHybridLayerByElementId,
    setInfoMsg,
    toText,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const e2eApi = {
      selectTool(toolRaw) {
        selectHybridPaletteTool(toolRaw);
      },
      ensureEditVisible() {
        showHybridLayer();
        setHybridLayerMode("edit", {
          skipV2Seed: true,
          skipLegacySeed: true,
        });
      },
      createElementAt(pointRaw, typeRaw = "rect") {
        showHybridLayer();
        setHybridLayerMode("edit", {
          skipV2Seed: true,
          skipLegacySeed: true,
        });
        const nextType = toText(typeRaw).toLowerCase() || "rect";
        setHybridV2Tool(nextType);
        return hybridTools.createElementAt(pointRaw, nextType);
      },
      startStencilPlacement(templateRaw = {}) {
        showHybridLayer();
        setHybridLayerMode("edit", {
          skipV2Seed: true,
          skipLegacySeed: true,
        });
        return hybridTools.startStencilPlacement(templateRaw);
      },
      placeStencilAtClient(clientX, clientY) {
        return hybridTools.placeStencilAtClient(clientX, clientY);
      },
      getState() {
        return {
          mode: hybridModeEffective,
          visible: !!hybridVisible,
          tool: String(hybridTools.toolState || ""),
          stencilPlacementActive: !!hybridTools.stencilPlacementActive,
        };
      },
      readDoc() {
        return normalizeHybridV2Doc(hybridV2DocRef.current);
      },
    };
    window.__FPC_E2E_HYBRID__ = e2eApi;
    return () => {
      if (window.__FPC_E2E_HYBRID__ === e2eApi) {
        window.__FPC_E2E_HYBRID__ = null;
      }
    };
  }, [hybridModeEffective, hybridTools, hybridVisible, normalizeHybridV2Doc, selectHybridPaletteTool, setHybridLayerMode, setHybridV2Tool, showHybridLayer, toText, hybridV2DocRef]);

  const hybridV2PlaybackHighlightedIds = useMemo(() => {
    const byBpmnId = hybridTools.bindingByBpmnId;
    const out = new Set();
    playbackHighlightedBpmnIds.forEach((bpmnId) => {
      asArray(byBpmnId[bpmnId]).forEach((bindingRaw) => {
        const binding = asObject(bindingRaw);
        const hybridId = toText(binding.hybrid_id || binding.hybridId);
        if (hybridId) out.add(hybridId);
      });
    });
    return out;
  }, [asArray, asObject, hybridTools.bindingByBpmnId, playbackHighlightedBpmnIds, toText]);

  useEffect(() => {
    if (tab !== "diagram" || !hybridVisible) return;
    const activeIds = Array.from(playbackHighlightedBpmnIds);
    if (!activeIds.length) return;
    const nextHybridId = activeIds.find((bpmnId) => !!asObject(hybridLayerMapLive)[toText(bpmnId)]);
    if (!nextHybridId) return;
    setHybridLayerActiveElementId((prevRaw) => {
      const prev = toText(prevRaw);
      return prev === nextHybridId ? prev : nextHybridId;
    });
  }, [asObject, hybridLayerMapLive, hybridVisible, playbackHighlightedBpmnIds, setHybridLayerActiveElementId, tab, toText]);

  useEffect(() => {
    const draftV2 = normalizeHybridV2Doc(asObject(asObject(draft?.bpmn_meta).hybrid_v2));
    if (asArray(draftV2.elements).length > 0 || asArray(draftV2.edges).length > 0) return;
    const v1Map = normalizeHybridLayerMap(hybridLayerMapFromDraft);
    if (!Object.keys(v1Map).length) return;
    if (typeof window !== "undefined" && hasKnownHybridV2Session(window.localStorage, sid)) return;
    const guardKey = `${sid}:${serializeHybridLayerMap(v1Map)}`;
    if (hybridV2MigrationGuardRef.current === guardKey) return;
    hybridV2MigrationGuardRef.current = guardKey;
    const migrated = migrateHybridV1ToV2(v1Map, (bpmnId) => {
      const anchor = asObject(readHybridElementAnchor(bpmnId));
      if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
      return {
        x: Number(anchor.x || 0),
        y: Number(anchor.y || 0),
      };
    });
    setHybridV2Doc(migrated);
    hybridV2DocRef.current = migrated;
    hybridTools.setImportNotice("Migrated v1 -> v2");
    void persistHybridV2Doc(migrated, { source: "hybrid_v2_migrate_v1" });
  }, [asArray, asObject, draft?.bpmn_meta, hybridLayerMapFromDraft, hybridTools, hybridV2DocRef, hybridV2MigrationGuardRef, normalizeHybridLayerMap, normalizeHybridV2Doc, persistHybridV2Doc, readHybridElementAnchor, setHybridV2Doc, sid]);

  useEffect(() => {
    if (!hybridDebugEnabled || tab !== "diagram" || !hybridVisible) return;
    const rows = asArray(hybridLayerRenderRows).slice(0, 20).map((rowRaw) => {
      const row = asObject(rowRaw);
      return {
        elementId: toText(row?.elementId),
        hasCenter: !!row?.hasCenter,
        dx: Number(row?.rawDx || 0),
        dy: Number(row?.rawDy || 0),
        x: Math.round(Number(row?.rawX || 0) * 10) / 10,
        y: Math.round(Number(row?.rawY || 0) * 10) / 10,
        insideViewport: !!row?.insideViewport,
        clamped: !!row?.wasClamped,
      };
    });
    // eslint-disable-next-line no-console
    console.info("[HYBRID_DEBUG] visibility", {
      viewport: asObject(hybridViewportSize),
      viewbox: asObject(overlayViewbox),
      container: asObject(overlayContainerRect),
      stats: asObject(hybridLayerVisibilityStats),
      rows,
    });
  }, [asArray, asObject, hybridDebugEnabled, hybridLayerRenderRows, hybridLayerVisibilityStats, hybridViewportSize, hybridVisible, overlayContainerRect, overlayViewbox, tab, toText]);

  useEffect(() => {
    if (tab !== "diagram" || !hybridVisible) return;
    const total = Number(hybridLayerVisibilityStats.total || 0);
    const inside = Number(hybridLayerVisibilityStats.insideViewport || 0);
    if (total <= 0 || inside > 0) {
      hybridAutoFocusGuardRef.current = "";
      return;
    }
    const guardKey = `${sid}:${total}:${inside}`;
    if (hybridAutoFocusGuardRef.current === guardKey) return;
    hybridAutoFocusGuardRef.current = guardKey;
    focusHybridLayer("hybrid_auto_focus_outside_viewport");
  }, [focusHybridLayer, hybridAutoFocusGuardRef, hybridLayerVisibilityStats.insideViewport, hybridLayerVisibilityStats.total, hybridVisible, sid, tab]);
  useHybridKeyboardController({
    isEditableTarget,
    tab,
    diagramActionHybridToolsOpen,
    selectHybridPaletteTool,
    hybridUiVisible: hybridUiPrefs.visible,
    setHybridPeekActive,
    markPlaybackOverlayInteraction,
    hybridModeEffective,
    setHybridUiPrefs,
    applyHybridModeTransition,
    setHybridV2BindPickMode,
    setDiagramActionHybridToolsOpen,
    hybridToolsCancelTransientState: hybridTools.cancelTransientState,
    hybridPeekActive,
    hybridUiLocked: hybridUiPrefs.lock,
    hybridSelectionCount: hybridSelection.selectionCount,
    hybridLayerActiveElementId,
    deleteLegacyHybridMarkers,
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (hybridModeEffective !== "edit") return undefined;
    const onMove = (event) => {
      const state = asObject(hybridLayerDragRef.current);
      const elementId = toText(state?.elementId);
      if (!elementId) return;
      const pointer = clientToDiagram(event?.clientX, event?.clientY);
      if (!pointer) return;
      const dx = Number(pointer.x || 0) - Number(state.startX || 0);
      const dy = Number(pointer.y || 0) - Number(state.startY || 0);
      setHybridLayerByElementId((prevRaw) => {
        const prev = normalizeHybridLayerMap(prevRaw);
        const row = asObject(prev[elementId]);
        return {
          ...prev,
          [elementId]: {
            dx: Math.round((Number(state.baseDx || row.dx || 0) + dx) * 10) / 10,
            dy: Math.round((Number(state.baseDy || row.dy || 0) + dy) * 10) / 10,
          },
        };
      });
    };
    const onUp = () => {
      const hadDrag = !!asObject(hybridLayerDragRef.current).elementId;
      hybridLayerDragRef.current = null;
      if (!hadDrag) return;
      void persistHybridLayerMap(hybridLayerMapRef.current, { source: "hybrid_layer_drag_end" });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [asObject, clientToDiagram, hybridLayerDragRef, hybridLayerMapRef, hybridModeEffective, normalizeHybridLayerMap, persistHybridLayerMap, setHybridLayerByElementId, toText]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock || !hybridVisible) return undefined;
    const onMouseDownCapture = (event) => {
      if (hybridV2ToolState !== "select") return;
      const host = bpmnStageHostRef.current;
      const target = event?.target;
      if (!host || !(target instanceof Node) || !host.contains(target)) return;
      if (
        target instanceof Element
        && (target.closest?.(".hybridLayerCard")
          || target.closest?.(".hybridLayerHotspot")
          || target.closest?.("[data-testid='hybrid-layer-overlay']")
          || target.closest?.("[data-testid='diagram-action-layers-popover']"))
      ) {
        return;
      }
      const elementId = resolveHybridTargetElementIdFromPoint(event?.clientX, event?.clientY);
      if (!elementId) return;
      if (hybridV2BindPickMode && hybridV2ActiveId) {
        bindActiveHybridV2ToBpmn(elementId);
        markPlaybackOverlayInteraction({
          stage: "hybrid_v2_bind_pick",
          elementId,
          hybridId: hybridV2ActiveId,
        });
        return;
      }
      addOrSelectHybridMarker(elementId, "hybrid_edit_surface_pointer");
      markPlaybackOverlayInteraction({
        stage: "hybrid_edit_surface_pointer",
        elementId,
      });
    };
    window.addEventListener("mousedown", onMouseDownCapture, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDownCapture, true);
    };
  }, [addOrSelectHybridMarker, bindActiveHybridV2ToBpmn, bpmnStageHostRef, hybridModeEffective, hybridUiPrefs.lock, hybridVisible, hybridV2ActiveId, hybridV2BindPickMode, hybridV2ToolState, markPlaybackOverlayInteraction, resolveHybridTargetElementIdFromPoint]);

  useEffect(() => {
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
    if (hybridV2ToolState !== "select") return;
    if (asArray(hybridV2DocRef.current?.elements).length > 0 || asArray(hybridV2DocRef.current?.edges).length > 0) return;
    const elementId = toNodeId(selectedElementId);
    const type = toText(selectedElementType).toLowerCase();
    if (!elementId) return;
    if (type.includes("sequenceflow") || type.includes("connection")) return;
    addOrSelectHybridMarker(elementId, "hybrid_edit_selection");
  }, [addOrSelectHybridMarker, asArray, hybridModeEffective, hybridUiPrefs.lock, hybridV2DocRef, hybridV2ToolState, selectedElementId, selectedElementType, toNodeId, toText]);

  const drawioUiState = useMemo(() => drawioMeta && typeof drawioMeta === "object" ? drawioMeta : {}, [drawioMeta]);

  const startHybridStencilPlacement = useCallback((templateRaw = {}) => {
    showHybridLayer();
    setHybridLayerMode("edit", {
      skipV2Seed: true,
      skipLegacySeed: true,
    });
    return hybridTools.startStencilPlacement(templateRaw);
  }, [hybridTools, setHybridLayerMode, showHybridLayer]);

  const hybridPlacementHitLayerActive = useMemo(() => {
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock || !hybridVisible) return false;
    const tool = String(hybridV2ToolState || "").trim().toLowerCase();
    return (
      tool === "template_stencil"
      || tool === "rect"
      || tool === "note"
      || tool === "text"
      || tool === "container"
      || tool === "arrow"
    );
  }, [hybridModeEffective, hybridUiPrefs.lock, hybridV2ToolState, hybridVisible]);

  return {
    hybridTools,
    hybridSelection,
    hybridV2DocLive,
    hybridV2BindingByHybridId,
    hybridV2Renderable,
    hybridV2TotalCount,
    hybridV2HiddenCount,
    hybridV2ToolState,
    hybridV2ActiveId,
    hybridV2SelectedIds,
    hybridV2SelectedIdSet,
    hybridV2ImportNotice,
    setHybridV2ActiveId,
    deleteSelectedHybridIds,
    hybridTotalCount,
    setHybridV2Tool,
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
    hybridToolsUiState,
    drawioUiState,
    setHybridToolsMode,
    selectHybridPaletteTool,
    startHybridStencilPlacement,
    hybridPlacementHitLayerActive,
    bindActiveHybridV2ToBpmn,
    goToActiveHybridBinding,
    exportHybridV2Drawio,
    handleHybridV2ImportFile,
    handleHybridV2ElementPointerDown,
    handleHybridV2ResizeHandlePointerDown,
    handleHybridV2OverlayPointerDown,
    handleHybridV2OverlayContextMenu,
    handleHybridV2ElementContextMenu,
    handleHybridV2ElementDoubleClick,
    deleteLegacyHybridMarkers,
    hybridV2PlaybackHighlightedIds,
    getHybridLayerCardRefCallback,
  };
}
