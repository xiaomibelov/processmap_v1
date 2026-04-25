import { bumpDrawioPerfCounter } from "../../drawio/runtime/drawioRuntimeProbes.js";

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildBpmnDiagramOverlayLayersProps({
  activeProjectId,
  bpmnFragmentPlacementActive,
  bpmnFragmentPlacementGhost,
  bpmnContextMenu,
  bpmnSubprocessPreview,
  bpmnRef,
  closeBpmnSubprocessPreview,
  closeBpmnContextMenu,
  diagramMode,
  draft,
  handleAiQuestionsByElementChange,
  handleBpmnSelectionChange,
  isInterviewMode,
  onBpmnSaveLifecycleEvent,
  onDiagramContextMenuDismiss,
  onDiagramContextMenuRequest,
  onElementNotesRemap,
  onSessionSync,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  propertiesOverlayAlwaysEnabled,
  propertiesOverlayAlwaysPreviewByElementId,
  queueDiagramMutation,
  reloadKey,
  robotMetaOverlayEnabled,
  robotMetaOverlayFilters,
  robotMetaStatusByElementId,
  selectedPropertiesOverlayPreview,
  sid,
  stepTimeUnit,
  tab,
  runBpmnContextMenuAction,
  openBpmnSubprocessPreviewProperties,
}) {
  bumpDrawioPerfCounter("overlay.vm.diagramOverlayProps.builds");
  return {
    bpmnStageProps: {
      ref: bpmnRef,
      sessionId: sid,
      activeProjectId,
      view: tab === "xml" ? "xml" : "editor",
      draft,
      reloadKey,
      onDiagramMutation: queueDiagramMutation,
      onElementSelectionChange: handleBpmnSelectionChange,
      onElementNotesRemap: onElementNotesRemap,
      onAiQuestionsByElementChange: handleAiQuestionsByElementChange,
      onSessionSync,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
      onSaveLifecycleEvent: onBpmnSaveLifecycleEvent,
      onDiagramContextMenuRequest,
      onDiagramContextMenuDismiss,
      aiQuestionsModeEnabled: isInterviewMode,
      diagramDisplayMode: diagramMode,
      stepTimeUnit,
      robotMetaOverlayEnabled,
      robotMetaOverlayFilters,
      robotMetaStatusByElementId,
      selectedPropertiesOverlayPreview,
      propertiesOverlayAlwaysEnabled,
      propertiesOverlayAlwaysPreviewByElementId,
    },
    bpmnContextMenuProps: {
      menu: bpmnContextMenu,
      onAction: (actionRequest) => {
        return runBpmnContextMenuAction?.(actionRequest);
      },
      onClose: closeBpmnContextMenu,
    },
    bpmnSubprocessPreviewProps: {
      preview: bpmnSubprocessPreview,
      onClose: closeBpmnSubprocessPreview,
      onOpenProperties: () => openBpmnSubprocessPreviewProperties?.(),
    },
    fragmentGhostProps: {
      active: bpmnFragmentPlacementActive,
      ghost: bpmnFragmentPlacementGhost,
    },
  };
}

export function buildDrawioDiagramOverlayLayersProps({
  clientToDiagram,
  closeEmbeddedDrawioEditor,
  commitDrawioOverlayMove,
  createDrawioRuntimeElement,
  deleteDrawioOverlayElement,
  drawioEditorOpen,
  drawioModeEffective,
  drawioRuntimeToolState,
  drawioUiState,
  drawioVisible,
  getOverlayViewportMatrix,
  handleDrawioEditorSave,
  hybridViewportMatrix,
  hybridViewportMatrixRef,
  setDrawioElementSize,
  setDrawioElementText,
  setDrawioElementTextWidth,
  setDrawioSelectedElementId,
  subscribeOverlayViewportMatrix,
  tab,
}) {
  bumpDrawioPerfCounter("overlay.vm.drawioOverlayProps.builds");
  const drawioMeta = asPlainObject(drawioUiState);
  return {
    drawioOverlayProps: {
      visible: tab === "diagram" && drawioVisible,
      drawioMeta,
      drawioMode: drawioModeEffective,
      drawioActiveTool: drawioRuntimeToolState,
      overlayMatrix: hybridViewportMatrix,
      overlayMatrixRef: hybridViewportMatrixRef,
      subscribeOverlayMatrix: subscribeOverlayViewportMatrix,
      getOverlayMatrix: getOverlayViewportMatrix,
      screenToDiagram: clientToDiagram,
      onCommitMove: commitDrawioOverlayMove,
      onCommitResize: setDrawioElementSize,
      onCommitTextResize: setDrawioElementTextWidth,
      onCommitText: setDrawioElementText,
      onCreateElement: createDrawioRuntimeElement,
      onDeleteElement: deleteDrawioOverlayElement,
      onSelectionChange: setDrawioSelectedElementId,
    },
    drawioEditorModalProps: {
      open: drawioEditorOpen,
      title: "Draw.io Editor",
      initialXml: drawioMeta.doc_xml,
      onSave: handleDrawioEditorSave,
      onClose: closeEmbeddedDrawioEditor,
    },
  };
}

export function buildHybridDiagramOverlayLayersProps({
  asObject,
  bpmnRef,
  cancelHybridTextEditor,
  cleanupMissingHybridBindings,
  closeHybridContextMenu,
  commitHybridTextEditor,
  deleteSelectedHybridIds,
  dismissHybridLockBusyNotice,
  getHybridLayerCardRefCallback,
  handleHybridLayerItemPointerDown,
  handleHybridV2ElementContextMenu,
  handleHybridV2ElementDoubleClick,
  handleHybridV2ElementPointerDown,
  handleHybridV2OverlayContextMenu,
  handleHybridV2OverlayPointerDown,
  handleHybridV2ResizeHandlePointerDown,
  hideHybridIds,
  hybridArrowPreview,
  hybridContextMenu,
  hybridDebugEnabled,
  hybridGhostPreview,
  hybridLayerActiveElementId,
  hybridLayerOverlayRef,
  hybridLayerRenderRows,
  hybridModeEffective,
  hybridOpacityValue,
  hybridPersistLockBusyNoticeMessage,
  hybridPersistLockBusyNoticeOpen,
  hybridPersistPendingDraft,
  hybridPlacementHitLayerActive,
  hybridSelectionCount,
  hybridTextEditor,
  hybridUiPrefs,
  hybridV2ActiveId,
  hybridV2BindingByHybridId,
  hybridV2DocLive,
  hybridV2PlaybackHighlightedIds,
  hybridV2Renderable,
  hybridV2SelectedIds,
  hybridV2SelectedIdSet,
  hybridVisible,
  lockLayersForHybridIds,
  onHybridOverlayPointerLeave,
  onHybridOverlayPointerMove,
  renameHybridItem,
  retryHybridPersist,
  setHybridLayerActiveElementId,
  tab,
  toText,
  updateHybridTextEditorValue,
  withHybridOverlayGuard,
}) {
  bumpDrawioPerfCounter("overlay.vm.hybridOverlayProps.builds");
  const normalizeObject = typeof asObject === "function" ? asObject : asPlainObject;
  const hybridDocLive = asPlainObject(hybridV2DocLive);
  return {
    hybridOverlayProps: {
      visible: tab === "diagram" && hybridVisible,
      modeEffective: hybridModeEffective,
      uiPrefs: hybridUiPrefs,
      opacityValue: hybridOpacityValue,
      overlayRef: hybridLayerOverlayRef,
      placementHitLayerActive: hybridPlacementHitLayerActive,
      onOverlayPointerDown: handleHybridV2OverlayPointerDown,
      onOverlayPointerMove: onHybridOverlayPointerMove,
      onOverlayPointerLeave: onHybridOverlayPointerLeave,
      onOverlayContextMenu: handleHybridV2OverlayContextMenu,
      v2Renderable: hybridV2Renderable,
      v2ActiveId: hybridV2ActiveId,
      v2SelectedIds: hybridV2SelectedIdSet,
      v2PlaybackHighlightedIds: hybridV2PlaybackHighlightedIds,
      v2BindingByHybridId: hybridV2BindingByHybridId,
      onV2ElementPointerDown: handleHybridV2ElementPointerDown,
      onV2ElementContextMenu: handleHybridV2ElementContextMenu,
      onV2ElementDoubleClick: handleHybridV2ElementDoubleClick,
      onV2ResizeHandlePointerDown: handleHybridV2ResizeHandlePointerDown,
      v2GhostPreview: hybridGhostPreview,
      v2ArrowPreview: hybridArrowPreview,
      v2TextEditor: hybridTextEditor,
      onV2TextEditorChange: updateHybridTextEditorValue,
      onV2TextEditorCommit: commitHybridTextEditor,
      onV2TextEditorCancel: cancelHybridTextEditor,
      legacyRows: hybridLayerRenderRows,
      legacyActiveElementId: hybridLayerActiveElementId,
      debugEnabled: hybridDebugEnabled,
      onLegacyHotspotMouseDown: (event, elementId) => {
        withHybridOverlayGuard(event, { action: "hotspot_mousedown", elementId });
      },
      onLegacyHotspotClick: (event, elementId) => {
        withHybridOverlayGuard(event, { action: "hotspot_click", elementId });
        setHybridLayerActiveElementId(elementId);
        bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1200 });
      },
      onLegacyCardMouseDown: handleHybridLayerItemPointerDown,
      onLegacyCardClick: (event, elementId) => {
        withHybridOverlayGuard(event, { action: "card_click", elementId });
      },
      onLegacyMissingCleanupMouseDown: (event, elementId) => {
        withHybridOverlayGuard(event, { action: "card_missing_cleanup_mousedown", elementId });
      },
      onLegacyMissingCleanupClick: (event, elementId) => {
        withHybridOverlayGuard(event, { action: "card_missing_cleanup_click", elementId });
        cleanupMissingHybridBindings("card_missing_cleanup");
      },
      onLegacyCardRef: getHybridLayerCardRefCallback,
    },
    hybridContextMenuProps: {
      menu: hybridContextMenu,
      selectionCount: hybridSelectionCount,
      canRename: hybridSelectionCount === 1
        && !!hybridDocLive.elements?.find((row) => toText(normalizeObject(row).id) === hybridV2ActiveId),
      onClose: closeHybridContextMenu,
      onDelete: () => {
        deleteSelectedHybridIds();
        closeHybridContextMenu();
      },
      onRename: () => {
        renameHybridItem(hybridV2ActiveId);
        closeHybridContextMenu();
      },
      onHide: () => {
        hideHybridIds(hybridV2SelectedIds);
        closeHybridContextMenu();
      },
      onLock: () => {
        lockLayersForHybridIds(hybridV2SelectedIds);
        closeHybridContextMenu();
      },
    },
    hybridPersistToastProps: {
      visible: tab === "diagram" && !!hybridPersistLockBusyNoticeOpen,
      message: hybridPersistLockBusyNoticeMessage,
      pendingDraft: !!hybridPersistPendingDraft,
      onRetry: () => {
        void retryHybridPersist?.();
      },
      onDismiss: dismissHybridLockBusyNotice,
    },
  };
}

export default function buildProcessDiagramOverlayLayersProps(input) {
  return {
    ...buildBpmnDiagramOverlayLayersProps(input),
    ...buildDrawioDiagramOverlayLayersProps(input),
    ...buildHybridDiagramOverlayLayersProps(input),
  };
}
