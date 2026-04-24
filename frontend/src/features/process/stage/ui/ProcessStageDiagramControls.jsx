import { useEffect, useRef, useState } from "react";
import LayersPopover from "../components/LayersPopover";
import TemplatesBottomMenu from "../../../templates/ui/TemplatesBottomMenu";
import GatewaysPanel from "../../playback/ui/GatewaysPanel";
import DiagramSearchPopover from "./DiagramSearchPopover";
import { apiGetSessionNoteAggregate } from "../../../../lib/api";
import NotesAggregateBadge from "../../../../components/NotesAggregateBadge.jsx";

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function ProcessStageDiagramControls({ view = {} }) {
  const legacyView = ensureObject(view);
  const sections = ensureObject(legacyView.sections);
  const useSectionedContract = Object.keys(sections).length > 0;
  const topbarSection = useSectionedContract ? ensureObject(sections.topbar) : legacyView;
  const drawioLayersSection = useSectionedContract ? ensureObject(sections.drawioLayers) : legacyView;
  const playbackAutopassSection = useSectionedContract ? ensureObject(sections.playbackAutopass) : legacyView;
  const pathsQualitySection = useSectionedContract ? ensureObject(sections.pathsQuality) : legacyView;
  const reportsTemplatesProblemsSection = useSectionedContract ? ensureObject(sections.reportsTemplatesProblems) : legacyView;
  const searchSection = useSectionedContract ? ensureObject(sections.search) : legacyView;
  const overflowModesSection = useSectionedContract ? ensureObject(sections.overflowModes) : legacyView;

  const {
    tab,
    diagramActionBarRef,
    bpmnRef,
    isBpmnTab,
    toText,
    asObject,
    diagramFocusMode,
    setDiagramFocusMode,
    diagramFullscreenActive,
    toggleDiagramFullscreen,
    setDiagramActionPathOpen,
    setDiagramActionHybridToolsOpen,
    setDiagramActionPlanOpen,
    setDiagramActionPlaybackOpen,
    setDiagramActionLayersOpen,
    setDiagramActionRobotMetaOpen,
    setRobotMetaListOpen,
    setDiagramActionQualityOpen,
    setDiagramActionOverflowOpen,
    diagramActionLayersOpen,
    diagramActionHybridToolsOpen,
    hybridVisible,
    drawioUiState,
    overlayPanelModel,
    hasSession,
    activeQualityOverlayCount,
    diagramActionQualityOpen,
    diagramActionOverflowOpen,
  } = topbarSection;
  const discussionsSessionId = toText(legacyView.sessionId);
  const openNotesDiscussions = typeof legacyView.openNotesDiscussions === "function"
    ? legacyView.openNotesDiscussions
    : null;
  const [notesAggregate, setNotesAggregate] = useState(null);

  const {
    templatesMenuOpen,
    setTemplatesMenuOpen,
    openTemplatesPicker,
    canOpenTemplatesList,
    templatesScope,
    setTemplatesScope,
    templatesActiveFolderId,
    setTemplatesActiveFolder,
    templatesFoldersByScope,
    scopedTemplates,
    reloadTemplatesAndFolders,
    templatesBusy,
    applyTemplate,
    removeTemplate,
    createTemplateFolderFromUi,
    workspaceActiveOrgId,
    canCreateOrgFolders,
    openReportsFromDiagram,
    openCreateTemplateModal,
    canCreateTemplateFromSelection,
    templateSelectionCount,
    openSelectedElementNotes,
    openSelectedElementAi,
    canUseElementContextActions,
    selectedInsertBetween,
    openInsertBetweenModal,
    insertBetweenBusy,
    canInsertBetween,
    insertBetweenErrorMessage,
  } = reportsTemplatesProblemsSection;

  const {
    diagramActionPlanOpen,
    diagramPlanPopoverRef,
    executionPlanSource,
    canExportExecutionPlan,
    executionPlanBusy,
    executionPlanPreview,
    asArray,
    executionPlanError,
    copyExecutionPlanFromDiagram,
    downloadExecutionPlanFromDiagram,
    saveExecutionPlanVersionFromDiagram,
    executionPlanSaveBusy,
    executionPlanVersions,
    shortHash,
    diagramActionPlaybackOpen,
    diagramPlaybackPopoverRef,
    playbackRuntimeSnapshot,
    playbackGraphError,
    playbackCanRun,
    playbackScenarioLabel,
    playbackScenarioKey,
    setPlaybackScenarioKey,
    playbackScenarioOptions,
    playbackIndexClamped,
    playbackTotal,
    playbackCurrentEvent,
    playbackEventTitle,
    playbackGateways,
    playbackGatewayChoices,
    playbackGatewayChoiceSource,
    playbackGatewayReadOnly,
    playbackDecisionMode,
    setPlaybackDecisionMode,
    playbackAwaitingGatewayId,
    formatPlaybackGatewayTitle,
    playbackGatewayOptionLabel,
    setPlaybackGatewayChoice,
    handlePlaybackPrev,
    handlePlaybackTogglePlay,
    handlePlaybackNext,
    handlePlaybackReset,
    playbackIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    playbackManualAtGateway,
    setPlaybackManualAtGateway,
    playbackAutoCamera,
    setPlaybackAutoCamera,
    autoPassUi,
    autoPassError,
    autoPassBlockedReason,
    startAutoPass,
    openDocFromDiagram,
    markPlaybackOverlayInteraction,
  } = playbackAutopassSection;

  const {
    diagramActionPathOpen,
    diagramPathPopoverRef,
    hasPathHighlightData,
    pathHighlightEnabled,
    setPathHighlightEnabled,
    availablePathTiers,
    pathHighlightCatalog,
    pathHighlightTier,
    setPathHighlightTier,
    setPathHighlightSequenceKey,
    availableSequenceKeysForTier,
    pathHighlightSequenceKey,
    openPathsFromDiagram,
    diagramQualityPopoverRef,
    setQualityOverlayAll,
    qualityOverlayRows,
    qualityOverlayFilters,
    toggleQualityOverlayFilter,
    setQualityOverlayListKey,
    setQualityOverlaySearch,
    qualityOverlayListKey,
    qualityOverlaySearch,
    qualityOverlayListItems,
    focusQualityOverlayItem,
    diagramActionRobotMetaOpen,
    diagramRobotMetaPopoverRef,
    robotMetaOverlayFilters,
    toggleRobotMetaOverlayFilter,
    showRobotMetaOverlay,
    resetRobotMetaOverlay,
    robotMetaCounts,
    robotMetaListOpen,
    diagramRobotMetaListRef,
    robotMetaListSearch,
    setRobotMetaListSearch,
    robotMetaListTab,
    setRobotMetaListTab,
    robotMetaListItems,
    focusRobotMetaItem,
  } = pathsQualitySection;

  const {
    diagramLayersPopoverRef,
    hybridTotalCount,
    showHybridLayer,
    hideHybridLayer,
    focusHybridLayer,
    hybridModeEffective,
    setHybridLayerMode,
    drawioModeEffective,
    setDrawioMode,
    hybridUiPrefs,
    selectHybridPaletteTool,
    setHybridLayerOpacity,
    toggleHybridLayerLock,
    toggleHybridLayerFocus,
    openEmbeddedDrawioEditor,
    toggleDrawioEnabled,
    setDrawioOpacity,
    toggleDrawioLock,
    setDrawioElementVisible,
    setDrawioElementLocked,
    setDrawioElementText,
    setDrawioElementTextWidth,
    setDrawioElementStylePreset,
    setDrawioElementSize,
    setDrawioElementAnchor,
    drawioFileInputRef,
    exportEmbeddedDrawio,
    hybridV2DocLive,
    hybridV2HiddenCount,
    revealAllHybridV2,
    toggleHybridV2LayerVisibility,
    toggleHybridV2LayerLock,
    setHybridV2LayerOpacity,
    hybridV2ActiveId,
    hybridV2SelectedIds,
    hybridLayerActiveElementId,
    hybridV2BindPickMode,
    setHybridV2BindPickMode,
    goToActiveHybridBinding,
    hybridV2BindingByHybridId,
    exportHybridV2Drawio,
    hybridV2FileInputRef,
    hybridV2ImportNotice,
    hybridLayerCounts,
    hybridLayerVisibilityStats,
    cleanupMissingHybridBindings,
    hybridLayerRenderRows,
    hybridV2Renderable,
    setHybridV2ActiveId,
    drawioSelectedElementId,
    setDrawioSelectedElementId,
    drawioAnchorImportDiagnostics,
    deleteOverlayEntity,
    goToHybridLayerItem,
    hideSelectedHybridItems,
    lockSelectedHybridItems,
    selectedElementContext,
  } = drawioLayersSection;

  const {
    diagramActionSearchOpen,
    setDiagramActionSearchOpen,
    diagramSearchPopoverRef,
    diagramSearchMode,
    setDiagramSearchMode,
    diagramSearchQuery,
    setDiagramSearchQuery,
    diagramSearchResults,
    diagramSearchActiveIndex,
    handleDiagramSearchPrev,
    handleDiagramSearchNext,
    selectDiagramSearchResult,
  } = searchSection;

  const {
    diagramOverflowPopoverRef,
    robotMetaOverlayEnabled,
    setRobotMetaOverlayEnabled,
    setRobotMetaOverlayFilters,
  } = overflowModesSection;
  const setSearchOpenSafe = typeof setDiagramActionSearchOpen === "function" ? setDiagramActionSearchOpen : () => {};

  const autoPassState = asObject(autoPassUi);
  const autoPassStatus = toText(autoPassState?.status).toLowerCase();
  const autoPassBusy = autoPassStatus === "queued" || autoPassStatus === "running" || autoPassStatus === "starting";
  const autoPassBlocked = toText(autoPassBlockedReason).length > 0;
  const autoPassLabel = toText(autoPassState?.label) || "Auto: idle";
  const autoPassProgress = Number(autoPassState?.progress || 0);
  const autoPassProgressPct = Math.max(
    0,
    Math.min(100, Math.round(autoPassProgress || (autoPassStatus === "done" ? 100 : 0))),
  );
  const overlayStatus = asObject(overlayPanelModel?.status);
  const overlayStatusKey = toText(overlayStatus.key).toLowerCase();
  const overlayStatusLabel = overlayStatusKey === "on_preview_missing"
    ? "ON ⚠ hidden"
    : (overlayStatusKey === "on_placement_ready"
      ? "ON"
      : (overlayStatusKey === "on" ? "ON" : (drawioUiState.enabled ? "ON" : "OFF")));
  const overlayStatusTitle = toText(overlayStatus.label) || (overlayStatusLabel === "ON ⚠ hidden" ? "ON · preview missing · hidden" : overlayStatusLabel);
  const unifiedOverlayPanelOpen = !!diagramActionLayersOpen || !!diagramActionHybridToolsOpen;
  const playbackRuntime = asObject(playbackRuntimeSnapshot);
  const playbackRuntimeProgress = asObject(playbackRuntime.progress);
  const playbackSourceOfTruth = asObject(playbackRuntime.sourceOfTruth);
  const playbackDiagnostics = asObject(playbackRuntime.diagnostics);
  const playbackCurrentEventResolved = asObject(playbackRuntime.currentFrame || playbackCurrentEvent);
  const playbackCurrentType = toText(playbackCurrentEventResolved?.type).toLowerCase();
  const playbackDecisionModeKey = toText(playbackSourceOfTruth.mode || playbackDecisionMode) || "manual";
  const playbackDecisionModeIsAuto = playbackDecisionModeKey === "auto_pass";
  const canSetPlaybackDecisionMode = typeof setPlaybackDecisionMode === "function";
  const playbackCanRunResolved = playbackRuntime.playbackCanRun === true || playbackCanRun === true;
  const playbackIndexResolved = Number.isFinite(Number(playbackRuntimeProgress.index))
    ? Number(playbackRuntimeProgress.index)
    : Number(playbackIndexClamped || 0);
  const playbackTotalResolved = Number.isFinite(Number(playbackRuntimeProgress.total))
    ? Number(playbackRuntimeProgress.total)
    : Number(playbackTotal || 0);
  const playbackGatewayChoiceSourceResolved = toText(
    playbackSourceOfTruth.choiceSource
      || playbackRuntime.gatewayChoiceSource
      || playbackGatewayChoiceSource,
  ) || "manual_local_choices";
  const playbackGatewayReadOnlyResolved = playbackSourceOfTruth.readOnly === true || playbackGatewayReadOnly === true;
  const playbackAwaitingGatewayIdResolved = toText(playbackRuntime.pendingGatewayId || playbackAwaitingGatewayId);
  const playbackIsPlayingResolved = playbackRuntime.runStatus === "playing"
    || playbackRuntime.runStatus === "auto"
    || playbackIsPlaying === true;
  const isWaitingGatewayDecision = playbackRuntime.isWaitingGatewayDecision === true;
  const isTerminalPlaybackState = playbackRuntime.isTerminalPlaybackState === true;
  const isFailedTerminalState = playbackRuntime.isFailedTerminalState === true;
  const hasMeaningfulExecutionProgress = playbackRuntime.hasMeaningfulExecutionProgress === true;
  const playbackCurrentNodeId = toText(playbackCurrentEventResolved?.nodeId || playbackCurrentEventResolved?.gatewayId);
  const playbackProgressLabel = toText(playbackRuntimeProgress.label)
    || `${Math.min(playbackIndexResolved + 1, Math.max(playbackTotalResolved, 1))} / ${playbackTotalResolved}`;
  const playbackStatusLabel = toText(playbackRuntime.runStatusLabel) || "Idle";
  const playbackStatusTone = toText(playbackRuntime.runStatusTone);
  const gatewayTotalCount = asArray(playbackGateways).length;
  const playbackRouteDecisionByNodeId = asObject(playbackRuntime.routeDecisionByNodeId);
  const knownGatewayIds = new Set(
    asArray(playbackGateways)
      .map((gatewayRaw) => toText(asObject(gatewayRaw).gateway_id))
      .filter(Boolean),
  );
  const coveredGatewayDecisionCount = Object.keys(playbackRouteDecisionByNodeId)
    .map((gatewayIdRaw) => toText(gatewayIdRaw))
    .filter((gatewayId) => {
      if (!gatewayId) return false;
      if (!knownGatewayIds.size) return true;
      return knownGatewayIds.has(gatewayId);
    })
    .length;
  const materializedCoveragePartial = (
    playbackDecisionModeIsAuto
    && playbackSourceOfTruth.hasMaterialized === true
    && gatewayTotalCount > 0
    && coveredGatewayDecisionCount > 0
    && coveredGatewayDecisionCount < gatewayTotalCount
  );
  const playbackCompletionReason = toText(playbackRuntime.completionReason);
  const playbackAcceptanceReason = toText(playbackRuntime.acceptanceReason);
  const playbackResetReason = toText(playbackRuntime.resetReason);
  const playbackRestartReason = toText(playbackRuntime.restartReason);
  const playbackTransitionReason = toText(playbackDiagnostics.lastTransitionReason);
  const gatewayPendingCount = isWaitingGatewayDecision ? 1 : 0;
  const shouldShowCurrentStep = hasMeaningfulExecutionProgress || isTerminalPlaybackState;
  const shouldShowPlaybackDocCta = playbackRuntime.shouldShowDocCta === true;

  const playbackPopoverOpenRef = useRef(false);
  const [gatewaySectionExpanded, setGatewaySectionExpanded] = useState(false);
  const [currentStepSectionExpanded, setCurrentStepSectionExpanded] = useState(false);
  const [playbackRuntimeCollapsed, setPlaybackRuntimeCollapsed] = useState(false);

  useEffect(() => {
    if (!diagramActionPlaybackOpen) {
      playbackPopoverOpenRef.current = false;
      setGatewaySectionExpanded(false);
      setCurrentStepSectionExpanded(false);
      setPlaybackRuntimeCollapsed(false);
      return;
    }
    if (!playbackPopoverOpenRef.current) {
      playbackPopoverOpenRef.current = true;
      setGatewaySectionExpanded(isWaitingGatewayDecision);
      setCurrentStepSectionExpanded(false);
      setPlaybackRuntimeCollapsed(hasMeaningfulExecutionProgress);
    }
  }, [diagramActionPlaybackOpen, hasMeaningfulExecutionProgress, isWaitingGatewayDecision]);

  useEffect(() => {
    if (!diagramActionPlaybackOpen) return;
    if (isWaitingGatewayDecision) {
      setGatewaySectionExpanded(true);
      if (!isTerminalPlaybackState) {
        setCurrentStepSectionExpanded(false);
      }
    }
  }, [diagramActionPlaybackOpen, isTerminalPlaybackState, isWaitingGatewayDecision]);

  useEffect(() => {
    if (!diagramActionPlaybackOpen) return;
    if (!shouldShowCurrentStep) return;
    if (playbackIsPlayingResolved || Number(playbackIndexResolved || 0) > 0 || isTerminalPlaybackState) {
      setCurrentStepSectionExpanded(true);
    }
  }, [
    diagramActionPlaybackOpen,
    isTerminalPlaybackState,
    playbackIndexResolved,
    playbackIsPlayingResolved,
    shouldShowCurrentStep,
  ]);

  useEffect(() => {
    if (!hasSession || !discussionsSessionId) {
      setNotesAggregate(null);
      return undefined;
    }
    let cancelled = false;
    async function refreshNotesAggregate() {
      const result = await apiGetSessionNoteAggregate(discussionsSessionId);
      if (cancelled) return;
      setNotesAggregate(result?.ok ? (result.aggregate || null) : null);
    }
    void refreshNotesAggregate();
    function handleNotesAggregateChanged(event) {
      const detail = ensureObject(event?.detail);
      const detailSessionId = toText(detail.sessionId);
      if (detailSessionId && detailSessionId !== discussionsSessionId) return;
      void refreshNotesAggregate();
    }
    window.addEventListener("processmap:notes-aggregate-changed", handleNotesAggregateChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("processmap:notes-aggregate-changed", handleNotesAggregateChanged);
    };
  }, [discussionsSessionId, hasSession, toText]);

  const handlePlaybackTogglePlayWithUiMode = () => {
    const shouldCollapseAfterStart = !playbackRuntimeCollapsed
      && !playbackIsPlayingResolved
      && !hasMeaningfulExecutionProgress;
    handlePlaybackTogglePlay();
    if (shouldCollapseAfterStart) {
      setPlaybackRuntimeCollapsed(true);
    }
  };

  const handlePlaybackResetWithUiMode = () => {
    handlePlaybackReset();
    setPlaybackRuntimeCollapsed(false);
    setGatewaySectionExpanded(false);
    setCurrentStepSectionExpanded(false);
  };

  const handleStartAutoPassWithUiMode = () => {
    if (!hasSession || autoPassBusy || autoPassBlocked) return;
    void startAutoPass();
    setPlaybackRuntimeCollapsed(true);
  };

  const handleOpenPlaybackDoc = () => {
    if (typeof openDocFromDiagram === "function") {
      openDocFromDiagram();
      return;
    }
    if (typeof openReportsFromDiagram === "function") {
      openReportsFromDiagram();
    }
  };

  if (tab !== "diagram") return null;

  const closeDiagramPopovers = () => {
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setSearchOpenSafe(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
  };

  const handleOpenNotesDiscussions = () => {
    if (!hasSession) return;
    closeDiagramPopovers();
    openNotesDiscussions?.();
  };

  return (
    <>
      <div className="bpmnCanvasTools diagramActionBar" ref={diagramActionBarRef}>
        <div className="diagramActionToolbarGroup">
          <button
            type="button"
            className={`secondaryBtn diagramActionBtn ${unifiedOverlayPanelOpen ? "ring-1 ring-accent/60" : ""}`}
            onClick={() => {
              const next = !unifiedOverlayPanelOpen;
              closeDiagramPopovers();
              setDiagramActionLayersOpen(next);
              setDiagramActionHybridToolsOpen(next);
            }}
            data-testid="diagram-action-layers"
          >
            <span>Слои</span>
            <span className="diagramActionChip" title={overlayStatusTitle}>
              {overlayStatusLabel}
            </span>
          </button>
          <span data-testid="templates-menu-button">
            <button
              type="button"
              className="secondaryBtn diagramActionBtn"
              onClick={() => {
                if (templatesMenuOpen) {
                  setTemplatesMenuOpen(false);
                  return;
                }
                void openTemplatesPicker();
              }}
              disabled={!canOpenTemplatesList}
              title="Открыть список шаблонов"
              data-testid="btn-templates"
            >
              Шаблоны
            </button>
          </span>
          <button
            type="button"
            className="secondaryBtn diagramActionBtn"
            onClick={() => {
              closeDiagramPopovers();
              openReportsFromDiagram();
            }}
            disabled={!hasSession}
            title="Открыть Reports для выбранного сценария"
            data-testid="diagram-action-reports"
          >
            Отчёты
          </button>
          <button
            type="button"
            className="primaryBtn diagramActionBtn relative z-[1]"
            onClick={handleOpenNotesDiscussions}
            disabled={!hasSession}
            title="Открыть обсуждения"
            data-testid="diagram-action-notes"
            data-notes-panel-trigger="true"
          >
            <span aria-hidden="true">✎</span>
            <span>Обсуждения</span>
            <NotesAggregateBadge
              aggregate={notesAggregate}
              compact
              label="Обсуждения"
              className="border-sky-200/80 bg-white/85 px-1.5 py-0 text-[10px] text-sky-950"
            />
          </button>
        </div>
        <div className="diagramActionToolbarGroup">
          <button
            type="button"
            className={`secondaryBtn diagramActionBtn ${diagramActionSearchOpen ? "ring-1 ring-accent/60" : ""}`}
            onClick={() => {
              const next = !diagramActionSearchOpen;
              closeDiagramPopovers();
              setSearchOpenSafe(next);
            }}
            title="Поиск элементов диаграммы"
            data-testid="diagram-action-search"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" strokeLinecap="round" />
            </svg>
            Поиск
          </button>
          <button
            type="button"
            className={`secondaryBtn diagramActionBtn ${diagramFocusMode ? "ring-1 ring-accent/60" : ""}`}
            onClick={() => {
              setDiagramFocusMode((prev) => !prev);
              closeDiagramPopovers();
            }}
            title="Скрыть второстепенные панели и сфокусироваться на диаграмме"
            data-testid="diagram-action-focus-mode"
          >
            {diagramFocusMode ? "Выход из фокуса" : "Фокус"}
          </button>
          <button
            type="button"
            className={`secondaryBtn diagramActionBtn ${diagramFullscreenActive ? "ring-1 ring-accent/60" : ""}`}
            onClick={() => {
              closeDiagramPopovers();
              void toggleDiagramFullscreen?.();
            }}
            title="Fullscreen диаграммы"
            data-testid="diagram-action-fullscreen-mode"
          >
            {diagramFullscreenActive ? "Обычный экран" : "Полный экран"}
          </button>
          <button
            type="button"
            className="secondaryBtn diagramActionBtn diagramActionBtn--icon"
            onClick={() => {
              const next = !diagramActionOverflowOpen;
              closeDiagramPopovers();
              setDiagramActionOverflowOpen(next);
            }}
            aria-label="Открыть дополнительные действия Diagram"
            data-testid="diagram-action-overflow"
          >
            ⋯
          </button>
        </div>
        <div className="diagramActionToolbarGroup diagramActionToolbarGroup--zoom">
          <button
            type="button"
            className="secondaryBtn diagramActionBtn diagramActionBtn--icon"
            onClick={() => bpmnRef.current?.zoomOut?.()}
            disabled={!isBpmnTab}
            title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom out"}
            data-testid="diagram-zoom-out"
          >
            –
          </button>
          <button
            type="button"
            className="secondaryBtn diagramActionBtn diagramActionBtn--icon"
            onClick={() => bpmnRef.current?.fit?.()}
            disabled={!isBpmnTab}
            title={!isBpmnTab ? "Доступно в Diagram/XML" : "Fit"}
            data-testid="diagram-zoom-fit"
          >
            ↔
          </button>
          <button
            type="button"
            className="secondaryBtn diagramActionBtn diagramActionBtn--icon"
            onClick={() => bpmnRef.current?.zoomIn?.()}
            disabled={!isBpmnTab}
            title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom in"}
            data-testid="diagram-zoom-in"
          >
            +
          </button>
        </div>
      </div>

      {diagramActionPathOpen ? (
        <div className="diagramActionPopover diagramActionPopover--path" ref={diagramPathPopoverRef} data-testid="diagram-action-path-popover">
          <div className="diagramActionPopoverHead">
            <span>Path highlight</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setDiagramActionPathOpen(false)}
            >
              Закрыть
            </button>
          </div>
          {!hasPathHighlightData ? (
            <div className="diagramActionPopoverEmpty">
              Нет path-meta в `bpmn_meta.node_path_meta/flow_meta`.
            </div>
          ) : (
            <>
              <label className="diagramActionCheckboxRow">
                <input
                  type="checkbox"
                  checked={pathHighlightEnabled}
                  onChange={(event) => setPathHighlightEnabled(!!event.target.checked)}
                />
                <span>Включить подсветку</span>
              </label>
              <div className="diagramActionTierList">
                {availablePathTiers.map((tier) => {
                  const row = asObject(pathHighlightCatalog[tier]);
                  const selected = tier === pathHighlightTier;
                  return (
                    <button
                      key={`path_tier_${tier}`}
                      type="button"
                      className={`diagramActionTierBtn ${selected ? "isActive" : ""}`}
                      onClick={() => {
                        setPathHighlightTier(tier);
                        setPathHighlightSequenceKey("");
                        setPathHighlightEnabled(true);
                      }}
                    >
                      <span>{tier}</span>
                      <span className="diagramActionTierMeta">{Number(row?.nodes || 0)} узл · {Number(row?.flows || 0)} flow</span>
                    </button>
                  );
                })}
              </div>
              <div className="diagramActionField">
                <span>Alt / sequence</span>
                <select
                  className="select h-8 min-h-0 text-xs"
                  value={pathHighlightSequenceKey}
                  onChange={(event) => {
                    setPathHighlightSequenceKey(toText(event.target.value));
                    setPathHighlightEnabled(true);
                  }}
                >
                  <option value="">Все для {pathHighlightTier || "tier"}</option>
                  {availableSequenceKeysForTier.map((key) => (
                    <option key={`path_seq_${key}`} value={key}>{key}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="diagramActionPopoverActions">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={openPathsFromDiagram}
            >
              Открыть Paths
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={openReportsFromDiagram}
            >
              Открыть Reports
            </button>
          </div>
        </div>
      ) : null}

      <TemplatesBottomMenu
        open={!!templatesMenuOpen}
        onClose={() => setTemplatesMenuOpen(false)}
        activeScope={templatesScope}
        onScopeChange={(next) => {
          setTemplatesScope(next);
        }}
        activeFolderId={templatesActiveFolderId}
        onSelectFolder={(folderId) => setTemplatesActiveFolder(templatesScope, folderId)}
        foldersByScope={templatesFoldersByScope}
        templates={scopedTemplates}
        busy={!!templatesBusy}
        onRefresh={reloadTemplatesAndFolders}
        onApply={applyTemplate}
        onDelete={removeTemplate}
        onCreateFolder={createTemplateFolderFromUi}
        canCreateOrgFolder={!!workspaceActiveOrgId && !!canCreateOrgFolders}
        showOrgScope={!!workspaceActiveOrgId}
      />

      {diagramActionPlanOpen ? (
        <div className="diagramActionPopover diagramActionPopover--plan" ref={diagramPlanPopoverRef} data-testid="diagram-action-plan-popover">
          <div className="diagramActionPopoverHead">
            <span>Execution Plan</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setDiagramActionPlanOpen(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="diagramActionField">
            <span>Экспорт плана:</span>
            <b>{toText(executionPlanSource?.scenarioLabel) || "Scenario"}</b>
            <span className="muted small">path: {toText(executionPlanSource?.pathId) || "—"}</span>
          </div>
          {!canExportExecutionPlan ? (
            <div className="diagramActionPopoverEmpty">Нет шагов для экспорта в текущем source.</div>
          ) : executionPlanBusy && !executionPlanPreview ? (
            <div className="diagramActionPopoverEmpty">Сбор Execution Plan…</div>
          ) : (
            <>
              <div className="diagramIssueRows">
                <div className="diagramIssueRow">
                  Steps: <b>{Number(asObject(executionPlanPreview?.stats).steps_total || 0)}</b>
                  {" · "}
                  Ready: <b>{Number(asObject(executionPlanPreview?.stats).robot_ready || 0)}</b>
                  {" · "}
                  Incomplete: <b data-testid="diagram-action-plan-summary-incomplete">{Number(asObject(executionPlanPreview?.stats).robot_incomplete || 0)}</b>
                  {" · "}
                  Human: <b>{Number(asObject(executionPlanPreview?.stats).human_only || 0)}</b>
                </div>
                <div className="diagramIssueRow muted small">
                  hash: {shortHash(executionPlanPreview?.steps_hash)}
                </div>
              </div>
              {Number(asObject(executionPlanPreview?.stats).robot_incomplete || 0) > 0 ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                  План не полностью роботизируем: incomplete {Number(asObject(executionPlanPreview?.stats).robot_incomplete || 0)}
                </div>
              ) : null}
              <div className="diagramIssueListWrap mt-2 border-t border-border/70 pt-2">
                <div className="muted mb-1 text-[11px]">Issues (top 10)</div>
                <div className="diagramIssueList">
                  {asArray(executionPlanPreview?.issues).slice(0, 10).length === 0 ? (
                    <div className="diagramActionPopoverEmpty">Нет issues.</div>
                  ) : (
                    asArray(executionPlanPreview?.issues).slice(0, 10).map((issueRaw, idx) => {
                      const issue = asObject(issueRaw);
                      return (
                        <div key={`plan_issue_${idx}_${toText(issue?.code)}`} className="diagramIssueListItem">
                          <span className="diagramIssueListItemTitle">{toText(issue?.code) || "ISSUE"}</span>
                          <span className="diagramIssueListItemMeta">
                            #{Number(issue?.order_index || 0)} · {toText(issue?.bpmn_id) || "—"} · {toText(issue?.severity) || "warn"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
          {executionPlanError ? (
            <div className="mt-2 text-[11px] text-danger">{executionPlanError}</div>
          ) : null}
          <div className="diagramActionPopoverActions">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => void copyExecutionPlanFromDiagram()}
              disabled={!canExportExecutionPlan || executionPlanBusy}
              data-testid="diagram-action-plan-copy"
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => void downloadExecutionPlanFromDiagram()}
              disabled={!canExportExecutionPlan || executionPlanBusy}
              data-testid="diagram-action-plan-download"
            >
              Download .json
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => void saveExecutionPlanVersionFromDiagram()}
              disabled={!canExportExecutionPlan || executionPlanBusy || executionPlanSaveBusy}
              data-testid="diagram-action-plan-save"
            >
              {executionPlanSaveBusy ? "Saving…" : "Save version"}
            </button>
          </div>
          <div className="diagramActionField">
            <span>Сохранённых версий:</span>
            <b data-testid="diagram-action-plan-versions-count">{executionPlanVersions.length}</b>
          </div>
          {executionPlanVersions.length > 0 ? (
            <div className="diagramIssueListWrap">
              <div className="diagramIssueList">
                {executionPlanVersions.slice(-5).reverse().map((versionRaw) => {
                  const version = asObject(versionRaw);
                  return (
                    <div key={`plan_version_${toText(version?.id)}`} className="diagramIssueListItem">
                      <span className="diagramIssueListItemTitle">{toText(version?.path_id) || "path"}</span>
                      <span className="diagramIssueListItemMeta">
                        {toText(version?.created_at).replace("T", " ").slice(0, 19)} · {shortHash(version?.steps_hash)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {executionPlanPreview ? (
            <div className="diagramActionField">
              <span>JSON preview</span>
              <pre className="diagramActionJsonPreview" data-testid="diagram-action-plan-json-preview">
                {JSON.stringify(executionPlanPreview, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <DiagramSearchPopover
        open={diagramActionSearchOpen}
        popoverRef={diagramSearchPopoverRef}
        mode={diagramSearchMode}
        onModeChange={setDiagramSearchMode}
        query={diagramSearchQuery}
        onQueryChange={setDiagramSearchQuery}
        results={diagramSearchResults}
        activeIndex={Number.isFinite(Number(diagramSearchActiveIndex)) ? Number(diagramSearchActiveIndex) : -1}
        onPrev={handleDiagramSearchPrev}
        onNext={handleDiagramSearchNext}
        onSelect={selectDiagramSearchResult}
        onClose={() => setSearchOpenSafe(false)}
      />

      {diagramActionPlaybackOpen ? (
        <div
          className={`diagramActionPopover diagramActionPopover--playback ${playbackRuntimeCollapsed ? "isCompact" : ""}`}
          ref={diagramPlaybackPopoverRef}
          data-testid="diagram-action-playback-popover"
        >
          <div className="diagramActionPopoverHead diagramActionPopoverHead--playback">
            <div className="playbackHeaderMeta">
              <span className="playbackHeaderTitle">Проход процесса</span>
              <span className={`playbackStatusBadge ${playbackStatusTone}`}>{playbackStatusLabel}</span>
            </div>
            <div className="playbackHeaderActions">
              {playbackRuntimeCollapsed ? (
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => setPlaybackRuntimeCollapsed(false)}
                  data-testid="diagram-action-playback-expand"
                >
                  Детали
                </button>
              ) : (hasMeaningfulExecutionProgress ? (
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => setPlaybackRuntimeCollapsed(true)}
                  data-testid="diagram-action-playback-collapse"
                >
                  Свернуть
                </button>
              ) : null)}
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => setDiagramActionPlaybackOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
          {!!toText(playbackGraphError) ? (
            <div className="diagramActionPopoverEmpty mx-3 my-3">
              Graph error: {toText(playbackGraphError)}
            </div>
          ) : !playbackCanRunResolved ? (
            <div className="diagramActionPopoverEmpty mx-3 my-3">
              Нет событий playback. Нажмите Reset.
            </div>
          ) : playbackRuntimeCollapsed ? (
            <div className="playbackCompactBody" data-testid="diagram-action-playback-compact">
              <div className="playbackCompactMeta">
                <span className="playbackCompactChip" title={toText(playbackScenarioLabel) || "Scenario"}>
                  {toText(playbackScenarioLabel) || "Scenario"}
                </span>
                <span className="playbackCompactChip" data-testid="diagram-action-playback-progress">
                  {playbackProgressLabel}
                </span>
                <span className={`playbackCompactChip ${isWaitingGatewayDecision ? "isWarning" : ""}`}>
                  {isWaitingGatewayDecision ? "Нужно решение gateway" : playbackStatusLabel}
                </span>
                {playbackCurrentNodeId ? (
                  <span className="playbackCompactNode" title={playbackCurrentNodeId}>
                    {playbackCurrentNodeId}
                  </span>
                ) : null}
              </div>
              {isWaitingGatewayDecision ? (
                <div className="playbackCompactAlert">
                  <span>Ожидается решение gateway</span>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      setPlaybackRuntimeCollapsed(false);
                      setGatewaySectionExpanded(true);
                    }}
                  >
                    Выбрать
                  </button>
                </div>
              ) : null}
              <div className="playbackCompactControls">
                <button
                  type="button"
                  className="primaryBtn h-8 min-h-0 px-3 py-0 text-[11px]"
                  onClick={handlePlaybackTogglePlayWithUiMode}
                  data-testid="diagram-action-playback-compact-play"
                >
                  {playbackIsPlayingResolved ? "⏸ Пауза" : "▶ Продолжить"}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-8 px-2 text-[11px]"
                  onClick={handlePlaybackNext}
                  data-testid="diagram-action-playback-compact-next"
                >
                  Следующий
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-8 px-2 text-[11px]"
                  onClick={handlePlaybackResetWithUiMode}
                  data-testid="diagram-action-playback-compact-reset"
                >
                  Сброс
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-8 px-2 text-[11px]"
                  onClick={handleStartAutoPassWithUiMode}
                  disabled={!hasSession || autoPassBusy || autoPassBlocked}
                  data-testid="diagram-action-playback-compact-auto"
                  title={autoPassBlockedReason || autoPassError || "Запустить автопроход"}
                >
                  {autoPassBusy ? "Авто…" : "Авто"}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-8 px-2 text-[11px]"
                  onClick={() => setPlaybackRuntimeCollapsed(false)}
                  data-testid="diagram-action-playback-compact-details"
                >
                  Детали
                </button>
                {shouldShowPlaybackDocCta ? (
                  <button
                    type="button"
                    className="secondaryBtn h-8 px-2 text-[11px]"
                    onClick={handleOpenPlaybackDoc}
                    data-testid="diagram-action-playback-open-doc"
                  >
                    Открыть DOC
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="playbackContextStrip">
                <div className="playbackContextItem">
                  <span>Сценарий</span>
                  <b>{toText(playbackScenarioLabel) || "Scenario"}</b>
                </div>
                <div className="playbackContextItem">
                  <span>Шаг</span>
                  <b data-testid="diagram-action-playback-progress">{playbackProgressLabel}</b>
                </div>
                <div className="playbackContextItem">
                  <span>Узел</span>
                  <b className="truncate" title={playbackCurrentNodeId || "—"}>
                    {playbackCurrentNodeId || "—"}
                  </b>
                </div>
                <div className="playbackContextItem">
                  <span>Path</span>
                  <b>{toText(executionPlanSource?.pathId) || "—"}</b>
                </div>
              </div>

              <div className="playbackMainBody">
                <div className="playbackScenarioField">
                  <label htmlFor="playback-scenario-select">Сценарий прохода</label>
                  <select
                    id="playback-scenario-select"
                    className="select h-8 min-h-0 text-xs"
                    value={playbackScenarioKey}
                    onChange={(event) => setPlaybackScenarioKey(toText(event.target.value) || "active")}
                    data-testid="diagram-action-playback-scenario"
                  >
                    {playbackScenarioOptions.map((optionRaw) => {
                      const option = asObject(optionRaw);
                      const key = toText(option?.key);
                      return (
                        <option key={`playback_scenario_${key}`} value={key}>
                          {toText(option?.label || key)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <section className={`playbackSection ${gatewaySectionExpanded ? "isExpanded" : ""} ${isWaitingGatewayDecision ? "isWaiting" : ""}`}>
                  <button
                    type="button"
                    className="playbackSectionHead"
                    onClick={() => setGatewaySectionExpanded((prev) => !prev)}
                    aria-expanded={gatewaySectionExpanded ? "true" : "false"}
                    data-testid="playback-gateway-section-toggle"
                  >
                    <span className="playbackSectionTitle">Решения gateway</span>
                    <span className="playbackSectionMeta">
                      <span className={`playbackSectionState ${isWaitingGatewayDecision ? "isWarning" : ""}`}>
                        {isWaitingGatewayDecision ? "waiting" : "none"}
                      </span>
                      <span className="diagramIssueChip">{`pending ${gatewayPendingCount} / ${gatewayTotalCount}`}</span>
                      <span className="playbackSectionChevron">{gatewaySectionExpanded ? "▾" : "▸"}</span>
                    </span>
                  </button>
                  {gatewaySectionExpanded ? (
                    <div className="playbackSectionBody">
                      <GatewaysPanel
                        showTitle={false}
                        gateways={playbackGateways}
                        choices={playbackGatewayChoices}
                        choiceSource={playbackGatewayChoiceSourceResolved}
                        readOnly={playbackGatewayReadOnlyResolved || playbackDecisionModeIsAuto}
                        activeGatewayId={playbackAwaitingGatewayIdResolved}
                        onChangeChoice={(gatewayId, flowId) => {
                          if (playbackDecisionModeIsAuto || playbackGatewayReadOnlyResolved) return;
                          setPlaybackGatewayChoice(gatewayId, flowId);
                        }}
                      />
                    </div>
                  ) : null}
                </section>

                {shouldShowCurrentStep ? (
                  <section className={`playbackSection ${currentStepSectionExpanded ? "isExpanded" : ""}`}>
                    <button
                      type="button"
                      className="playbackSectionHead"
                      onClick={() => setCurrentStepSectionExpanded((prev) => !prev)}
                      aria-expanded={currentStepSectionExpanded ? "true" : "false"}
                      data-testid="playback-current-step-section-toggle"
                    >
                      <span className="playbackSectionTitle">Текущий шаг</span>
                      <span className="playbackSectionMeta">
                        <span className="diagramIssueChip" data-testid="diagram-action-playback-event-type">
                          {toText(playbackCurrentEventResolved?.type) || "—"}
                        </span>
                        <span className="playbackSectionChevron">{currentStepSectionExpanded ? "▾" : "▸"}</span>
                      </span>
                    </button>
                    {currentStepSectionExpanded ? (
                      <div className="playbackSectionBody">
                        <div className="playbackInfoTable">
                          <div className="playbackInfoRow">
                            <span>Событие</span>
                            <b className="truncate" title={playbackEventTitle(playbackCurrentEventResolved)}>
                              {playbackEventTitle(playbackCurrentEventResolved)}
                            </b>
                          </div>
                          <div className="playbackInfoRow">
                            <span>Тип</span>
                            <span className="diagramIssueChip">
                              {toText(playbackCurrentEventResolved?.type) || "—"}
                            </span>
                          </div>
                          {toText(playbackCurrentEventResolved?.flowId) ? (
                            <div className="playbackInfoRow">
                              <span>Flow</span>
                              <span className="diagramIssueChip">{toText(playbackCurrentEventResolved?.flowId)}</span>
                            </div>
                          ) : null}
                          {toText(playbackCurrentEventResolved?.reason) ? (
                            <div className="playbackInfoRow">
                              <span>Причина</span>
                              <span className="diagramIssueChip">{toText(playbackCurrentEventResolved?.reason)}</span>
                            </div>
                          ) : null}
                          {playbackCurrentType === "stop" ? (
                            <>
                              <div className="playbackInfoRow">
                                <span>Шагов</span>
                                <span className="diagramIssueChip">
                                  {Number(asObject(playbackCurrentEventResolved?.metrics)?.stepsTotal || 0)}
                                </span>
                              </div>
                              <div className="playbackInfoRow">
                                <span>Вариаций</span>
                                <span className="diagramIssueChip">
                                  {Number(asObject(playbackCurrentEventResolved?.metrics)?.variationPoints || 0)}
                                </span>
                              </div>
                              <div className="playbackInfoRow">
                                <span>Решения</span>
                                <span className="diagramIssueChip">
                                  m:{Number(asObject(playbackCurrentEventResolved?.metrics)?.manualDecisionsApplied || 0)}
                                  {" / "}
                                  a:{Number(asObject(playbackCurrentEventResolved?.metrics)?.autoDecisionsApplied || 0)}
                                </span>
                              </div>
                              <div className="playbackInfoRow">
                                <span>Flow-переходы</span>
                                <span className="diagramIssueChip">
                                  {Number(asObject(playbackCurrentEventResolved?.metrics)?.flowTransitions || 0)}
                                </span>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section className="playbackSection playbackSection--placeholder">
                    <div className="playbackSectionPlaceholder">
                      Текущий шаг появится после запуска прохода.
                    </div>
                  </section>
                )}

                <details className="playbackAdvanced">
                  <summary>Параметры воспроизведения</summary>
                  <div className="playbackAdvancedBody">
                    <div className="playbackAdvancedField">
                      <span>Источник решений</span>
                      <select
                        className="select h-8 min-h-0 text-xs"
                        value={playbackDecisionModeIsAuto ? "auto_pass" : "manual"}
                        disabled={!canSetPlaybackDecisionMode}
                        onChange={(event) => {
                          if (!canSetPlaybackDecisionMode) return;
                          const next = toText(event.target.value);
                          if (next !== "auto_pass" && next !== "manual") return;
                          setPlaybackDecisionMode(next);
                        }}
                        data-testid="diagram-action-playback-decision-mode"
                      >
                        <option value="auto_pass">Auto-pass truth</option>
                        <option value="manual">Manual exploration</option>
                      </select>
                    </div>
                    <div className="playbackAdvancedField">
                      <span>Скорость</span>
                      <select
                        className="select h-8 min-h-0 text-xs"
                        value={playbackSpeed}
                        onChange={(event) => setPlaybackSpeed(toText(event.target.value) || "1")}
                        data-testid="diagram-action-playback-speed"
                      >
                        <option value="0.5">0.5x</option>
                        <option value="1">1x</option>
                        <option value="2">2x</option>
                        <option value="4">4x</option>
                      </select>
                    </div>
                    <label className="diagramActionCheckboxRow">
                      <input
                        type="checkbox"
                        checked={!!playbackManualAtGateway}
                        disabled={playbackDecisionModeIsAuto}
                        onChange={(event) => setPlaybackManualAtGateway(!!event.target.checked)}
                        data-testid="diagram-action-playback-manual-gateway"
                      />
                      <span>Ручное решение gateway</span>
                    </label>
                    <label className="diagramActionCheckboxRow">
                      <input
                        type="checkbox"
                        checked={!!playbackAutoCamera}
                        onChange={(event) => setPlaybackAutoCamera(!!event.target.checked)}
                        data-testid="diagram-action-playback-autocamera"
                      />
                      <span>Авто-камера</span>
                    </label>
                    <div className="playbackInfoRow" title={autoPassBlockedReason || autoPassError || ""}>
                      <span>Автопроход</span>
                      <span className="diagramIssueChip" data-testid="diagram-action-playback-auto-status">
                        {autoPassLabel}
                        {autoPassBusy || autoPassStatus === "done" ? ` (${autoPassProgressPct}%)` : ""}
                      </span>
                    </div>
                    <div className="playbackInfoRow">
                      <span>Pass truth</span>
                      <span className="diagramIssueChip" data-testid="diagram-action-playback-source">
                        {playbackGatewayChoiceSourceResolved}
                      </span>
                    </div>
                    <div className="playbackInfoRow">
                      <span>Mode/RO</span>
                      <span className="diagramIssueChip">
                        {playbackDecisionModeIsAuto ? "auto_pass" : "manual"}
                        {playbackGatewayReadOnlyResolved ? " · ro" : " · rw"}
                      </span>
                    </div>
                    {materializedCoveragePartial ? (
                      <div className="playbackInfoRow">
                        <span>Coverage</span>
                        <span className="diagramIssueChip" data-testid="diagram-action-playback-source-coverage">
                          materialized_partial {coveredGatewayDecisionCount}/{gatewayTotalCount}
                        </span>
                      </div>
                    ) : null}
                    <div className="playbackInfoRow">
                      <span>Complete/Accept</span>
                      <span className="diagramIssueChip" data-testid="diagram-action-playback-completion-acceptance">
                        {toText(playbackCompletionReason) || "-"}
                        {" · "}
                        {toText(playbackAcceptanceReason) || "-"}
                      </span>
                    </div>
                    <div className="playbackInfoRow">
                      <span>Reset/Restart</span>
                      <span className="diagramIssueChip" data-testid="diagram-action-playback-reset-restart">
                        {toText(playbackResetReason) || "-"}
                        {" · "}
                        {toText(playbackRestartReason) || "-"}
                      </span>
                    </div>
                    <div className="playbackInfoRow">
                      <span>Transition</span>
                      <span className="diagramIssueChip" data-testid="diagram-action-playback-transition-reason">
                        {playbackTransitionReason || "-"}
                      </span>
                    </div>
                    {autoPassBlocked ? (
                      <div className="playbackInfoRow" title={autoPassBlockedReason}>
                        <span>Проверка</span>
                        <span className="diagramIssueChip">{toText(autoPassBlockedReason)}</span>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>

              <div className="playbackControlsBar">
                <div className="playbackControlsMain">
                  <button
                    type="button"
                    className="secondaryBtn h-8 px-2 text-[11px]"
                    onClick={handlePlaybackPrev}
                    disabled={playbackIndexResolved <= 0}
                    data-testid="diagram-action-playback-prev"
                  >
                    ⏮ Назад
                  </button>
                  <button
                    type="button"
                    className="primaryBtn h-8 min-h-0 px-3 py-0 text-[11px]"
                    onClick={handlePlaybackTogglePlayWithUiMode}
                    data-testid="diagram-action-playback-play"
                  >
                    {playbackIsPlayingResolved ? "⏸ Пауза" : "▶ Старт"}
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-8 px-2 text-[11px]"
                    onClick={handlePlaybackNext}
                    data-testid="diagram-action-playback-next"
                  >
                    Вперёд ⏭
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-8 px-2 text-[11px]"
                    onClick={handlePlaybackResetWithUiMode}
                    data-testid="diagram-action-playback-reset"
                  >
                    Сброс
                  </button>
                </div>
                <button
                  type="button"
                  className="secondaryBtn h-8 px-2 text-[11px]"
                  onClick={handleStartAutoPassWithUiMode}
                  disabled={!hasSession || autoPassBusy || autoPassBlocked}
                  data-testid="diagram-action-playback-auto"
                  title={autoPassBlockedReason || autoPassError || "Запустить автопроход"}
                >
                  {autoPassBusy ? "Авто…" : "Автопроход"}
                </button>
              </div>
              {shouldShowPlaybackDocCta ? (
                <div className="playbackDocCtaRow">
                  <span className="text-[11px] text-muted">Автопроход завершён.</span>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={handleOpenPlaybackDoc}
                    data-testid="diagram-action-playback-open-doc"
                  >
                    Открыть DOC со шагами
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <LayersPopover
        open={unifiedOverlayPanelOpen}
        popoverRef={diagramLayersPopoverRef}
        onClose={() => {
          setDiagramActionLayersOpen(false);
          setDiagramActionHybridToolsOpen(false);
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
          markPlaybackOverlayInteraction({ stage: "layers_popover_mousedown" });
        }}
        hybridVisible={hybridVisible}
        hybridTotalCount={hybridTotalCount}
        showHybridLayer={showHybridLayer}
        hideHybridLayer={hideHybridLayer}
        focusHybridLayer={focusHybridLayer}
        hybridModeEffective={hybridModeEffective}
        setHybridLayerMode={setHybridLayerMode}
        drawioModeEffective={drawioModeEffective}
        setDrawioMode={setDrawioMode}
        hybridUiPrefs={hybridUiPrefs}
        onSetTool={selectHybridPaletteTool}
        setHybridLayerOpacity={setHybridLayerOpacity}
        toggleHybridLayerLock={toggleHybridLayerLock}
        toggleHybridLayerFocus={toggleHybridLayerFocus}
        drawioState={drawioUiState}
        onOpenDrawioEditor={openEmbeddedDrawioEditor}
        onToggleDrawioVisible={toggleDrawioEnabled}
        onSetDrawioOpacity={setDrawioOpacity}
        onToggleDrawioLock={toggleDrawioLock}
        onSetDrawioElementVisible={setDrawioElementVisible}
        onSetDrawioElementLocked={setDrawioElementLocked}
        onSetDrawioElementText={setDrawioElementText}
        onSetDrawioElementTextWidth={setDrawioElementTextWidth}
        onSetDrawioElementStylePreset={setDrawioElementStylePreset}
        onSetDrawioElementSize={setDrawioElementSize}
        onSetDrawioElementAnchor={setDrawioElementAnchor}
        onImportEmbeddedDrawioClick={() => drawioFileInputRef.current?.click?.()}
        onExportEmbeddedDrawio={exportEmbeddedDrawio}
        hybridV2DocLive={hybridV2DocLive}
        hybridV2HiddenCount={hybridV2HiddenCount}
        revealAllHybridV2={revealAllHybridV2}
        toggleHybridV2LayerVisibility={toggleHybridV2LayerVisibility}
        toggleHybridV2LayerLock={toggleHybridV2LayerLock}
        setHybridV2LayerOpacity={setHybridV2LayerOpacity}
        hybridV2ActiveId={hybridV2ActiveId}
        hybridV2SelectedIds={hybridV2SelectedIds}
        legacyActiveElementId={hybridLayerActiveElementId}
        hybridV2BindPickMode={hybridV2BindPickMode}
        setHybridV2BindPickMode={setHybridV2BindPickMode}
        goToActiveHybridBinding={goToActiveHybridBinding}
        hybridV2BindingByHybridId={hybridV2BindingByHybridId}
        exportHybridV2Drawio={exportHybridV2Drawio}
        onImportDrawioClick={() => hybridV2FileInputRef.current?.click?.()}
        hybridV2ImportNotice={hybridV2ImportNotice}
        hybridLayerCounts={hybridLayerCounts}
        hybridLayerVisibilityStats={hybridLayerVisibilityStats}
        cleanupMissingHybridBindings={cleanupMissingHybridBindings}
        hybridLayerRenderRows={hybridLayerRenderRows}
        hybridV2Renderable={hybridV2Renderable}
        setHybridV2ActiveId={setHybridV2ActiveId}
        drawioSelectedElementId={drawioSelectedElementId}
        setDrawioSelectedElementId={setDrawioSelectedElementId}
        drawioAnchorImportDiagnostics={drawioAnchorImportDiagnostics}
        overlayPanelModel={overlayPanelModel}
        onDeleteOverlayEntity={deleteOverlayEntity}
        bpmnRef={bpmnRef}
        selectedElementContext={selectedElementContext}
        goToHybridLayerItem={goToHybridLayerItem}
        onHideSelectedHybridItems={hideSelectedHybridItems}
        onLockSelectedHybridItems={lockSelectedHybridItems}
      />

      {diagramActionRobotMetaOpen ? (
        <div className="diagramActionPopover diagramActionPopover--robotmeta" ref={diagramRobotMetaPopoverRef} data-testid="diagram-action-robotmeta-popover">
          <div className="diagramActionPopoverHead">
            <span>Robot Meta</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setDiagramActionRobotMetaOpen(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="diagramIssueRows">
            <div className="diagramIssueRow">
              <label className="diagramActionCheckboxRow">
                <input
                  type="checkbox"
                  checked={!!robotMetaOverlayFilters?.ready}
                  onChange={() => toggleRobotMetaOverlayFilter("ready")}
                  data-testid="diagram-action-robotmeta-filter-ready"
                />
                <span>Ready ({Number(robotMetaCounts.ready || 0)})</span>
              </label>
            </div>
            <div className="diagramIssueRow">
              <label className="diagramActionCheckboxRow">
                <input
                  type="checkbox"
                  checked={!!robotMetaOverlayFilters?.incomplete}
                  onChange={() => toggleRobotMetaOverlayFilter("incomplete")}
                  data-testid="diagram-action-robotmeta-filter-incomplete"
                />
                <span>Incomplete ({Number(robotMetaCounts.incomplete || 0)})</span>
              </label>
            </div>
          </div>
          <div className="diagramActionPopoverActions">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={showRobotMetaOverlay}
              data-testid="diagram-action-robotmeta-show"
            >
              Показать
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={resetRobotMetaOverlay}
              data-testid="diagram-action-robotmeta-reset"
            >
              Сбросить
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setRobotMetaListOpen((prev) => !prev)}
              data-testid="diagram-action-robotmeta-list-toggle"
            >
              Список…
            </button>
          </div>
          {robotMetaListOpen ? (
            <div className="diagramIssueListWrap mt-2 border-t border-border/70 pt-2" ref={diagramRobotMetaListRef} data-testid="diagram-action-robotmeta-list">
              <input
                type="text"
                className="input h-8 min-h-0 text-xs"
                value={robotMetaListSearch}
                onChange={(event) => setRobotMetaListSearch(toText(event.target.value))}
                placeholder="Поиск по названию / bpmn_id / executor"
                data-testid="diagram-action-robotmeta-search"
              />
              <div className="diagramActionTabRow">
                <button
                  type="button"
                  className={`diagramActionTabBtn ${robotMetaListTab === "ready" ? "isActive" : ""}`}
                  onClick={() => setRobotMetaListTab("ready")}
                  data-testid="diagram-action-robotmeta-tab-ready"
                >
                  Ready
                </button>
                <button
                  type="button"
                  className={`diagramActionTabBtn ${robotMetaListTab === "incomplete" ? "isActive" : ""}`}
                  onClick={() => setRobotMetaListTab("incomplete")}
                  data-testid="diagram-action-robotmeta-tab-incomplete"
                >
                  Incomplete
                </button>
              </div>
              <div className="diagramIssueList">
                {robotMetaListItems.length === 0 ? (
                  <div className="diagramActionPopoverEmpty">Ничего не найдено.</div>
                ) : (
                  robotMetaListItems.slice(0, 120).map((itemRaw) => {
                    const item = asObject(itemRaw);
                    const nodeId = toText(item?.nodeId);
                    const title = toText(item?.title || nodeId) || nodeId;
                    return (
                      <button
                        key={`robotmeta_item_${robotMetaListTab}_${nodeId}`}
                        type="button"
                        className="diagramIssueListItem"
                        onClick={() => focusRobotMetaItem(item, "robot_meta_list")}
                        title={`${title} · ${nodeId}`}
                        data-testid="diagram-action-robotmeta-item"
                      >
                        <span className="diagramIssueListItemTitle">{title}</span>
                        <span className="diagramIssueListItemMeta">{nodeId}</span>
                        <span className="diagramIssueListItemChips">
                          <span className="diagramIssueChip">{toText(item?.mode) || "human"}</span>
                          <span className="diagramIssueChip">{toText(item?.executor) || "executor:—"}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {diagramActionQualityOpen ? (
        <div className="diagramActionPopover diagramActionPopover--quality" ref={diagramQualityPopoverRef} data-testid="diagram-action-quality-popover">
          <div className="diagramActionPopoverHead">
            <span>Проблемы на диаграмме</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setDiagramActionQualityOpen(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="diagramActionPopoverActions">
            <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => setQualityOverlayAll(true)}>
              Показать все
            </button>
            <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => setQualityOverlayAll(false)}>
              Сбросить
            </button>
          </div>
          <div className="diagramIssueRows">
            {qualityOverlayRows.map((row) => {
              const checked = !!qualityOverlayFilters?.[row.key];
              return (
                <div className="diagramIssueRow" key={`quality_row_${row.key}`}>
                  <label className="diagramActionCheckboxRow">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleQualityOverlayFilter(row.key)}
                    />
                    <span>{row.label} ({row.count})</span>
                  </label>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      setQualityOverlayListKey((prev) => (prev === row.key ? "" : row.key));
                      setQualityOverlaySearch("");
                    }}
                    disabled={row.count <= 0}
                  >
                    Список
                  </button>
                </div>
              );
            })}
          </div>
          {qualityOverlayListKey ? (
            <div className="diagramIssueListWrap">
              <input
                type="text"
                className="input h-8 min-h-0 text-xs"
                value={qualityOverlaySearch}
                onChange={(event) => setQualityOverlaySearch(toText(event.target.value))}
                placeholder="Поиск по названию / bpmn_id"
              />
              <div className="diagramIssueList">
                {qualityOverlayListItems.length === 0 ? (
                  <div className="diagramActionPopoverEmpty">Ничего не найдено.</div>
                ) : (
                  qualityOverlayListItems.map((itemRaw) => {
                    const item = asObject(itemRaw);
                    const nodeId = toText(item?.nodeId);
                    return (
                      <button
                        key={`quality_item_${qualityOverlayListKey}_${nodeId}`}
                        type="button"
                        className="diagramIssueListItem"
                        onClick={() => focusQualityOverlayItem(item, "quality_overlay_list")}
                        title={`${toText(item?.title)} · ${nodeId}`}
                      >
                        <span className="diagramIssueListItemTitle">{toText(item?.title) || nodeId}</span>
                        <span className="diagramIssueListItemMeta">{nodeId}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {diagramActionOverflowOpen ? (
        <div className="diagramActionPopover diagramActionPopover--overflow" ref={diagramOverflowPopoverRef} data-testid="diagram-action-overflow-popover">
          <div className="diagramActionPopoverHead">
            <span>Действия Diagram</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setDiagramActionOverflowOpen(false)}
            >
              Закрыть
            </button>
          </div>
          <div className="diagramIssueRows">
            <div className="diagramIssueRow">
              <span>Навигация и диагностика</span>
            </div>
          </div>
          <div className="diagramActionPopoverActions">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                closeDiagramPopovers();
                setDiagramActionPathOpen(true);
              }}
            >
              Подсветка путей
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                closeDiagramPopovers();
                setDiagramActionPlaybackOpen(true);
              }}
            >
              Проход
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                closeDiagramPopovers();
                setDiagramActionPlanOpen(true);
              }}
            >
              План (JSON)
            </button>
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${robotMetaOverlayEnabled ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => {
                closeDiagramPopovers();
                setDiagramActionRobotMetaOpen(true);
                setRobotMetaOverlayEnabled(true);
                setRobotMetaOverlayFilters((prev) => {
                  const next = {
                    ready: !!prev?.ready,
                    incomplete: !!prev?.incomplete,
                  };
                  if (!next.ready && !next.incomplete) return { ready: true, incomplete: true };
                  return next;
                });
              }}
            >
              Robot Meta
            </button>
          </div>
          <div className="diagramIssueRows mt-2">
            <div className="diagramIssueRow">
              <span>Контекст и редактирование</span>
            </div>
          </div>
          <div className="diagramActionPopoverActions">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                closeDiagramPopovers();
                openCreateTemplateModal();
              }}
              disabled={!canCreateTemplateFromSelection}
              title={canCreateTemplateFromSelection ? "Сохранить выделенные BPMN элементы как шаблон" : "Выделите BPMN элементы"}
            >
              {`Добавить шаблон${templateSelectionCount > 0 ? ` (${templateSelectionCount})` : ""}`}
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                closeDiagramPopovers();
                openSelectedElementNotes();
              }}
              disabled={!canUseElementContextActions}
              title="Открыть заметки по выбранному узлу"
            >
              Заметки
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                closeDiagramPopovers();
                openSelectedElementAi();
              }}
              disabled={!canUseElementContextActions}
            >
              AI
            </button>
            {selectedInsertBetween ? (
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => {
                  closeDiagramPopovers();
                  openInsertBetweenModal();
                }}
                disabled={insertBetweenBusy || !canInsertBetween}
                title={canInsertBetween ? "Вставить шаг между" : insertBetweenErrorMessage(selectedInsertBetween?.error)}
              >
                Вставить между
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
