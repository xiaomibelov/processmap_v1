import LayersPopover from "../components/LayersPopover";
import TemplatesBottomMenu from "../../../templates/ui/TemplatesBottomMenu";
import GatewaysPanel from "../../playback/ui/GatewaysPanel";

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
    playbackGatewayPending,
    playbackAwaitingGatewayId,
    formatPlaybackGatewayTitle,
    playbackGatewayOptionLabel,
    setPlaybackGatewayChoice,
    handlePlaybackGatewayDecision,
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
    deleteOverlayEntity,
    goToHybridLayerItem,
    hideSelectedHybridItems,
    lockSelectedHybridItems,
  } = drawioLayersSection;

  const {
    diagramOverflowPopoverRef,
    robotMetaOverlayEnabled,
    setRobotMetaOverlayEnabled,
    setRobotMetaOverlayFilters,
  } = overflowModesSection;

  if (tab !== "diagram") return null;
  const autoPassState = asObject(autoPassUi);
  const autoPassStatus = toText(autoPassState?.status).toLowerCase();
  const autoPassBusy = autoPassStatus === "queued" || autoPassStatus === "running" || autoPassStatus === "starting";
  const autoPassBlocked = toText(autoPassBlockedReason).length > 0;
  const autoPassLabel = toText(autoPassState?.label) || "Auto: idle";
  const autoPassProgress = Number(autoPassState?.progress || 0);
  const overlayStatusLabel = toText(asObject(overlayPanelModel?.status).label)
    || (drawioUiState.enabled ? "ON" : (hybridVisible ? "HYBRID" : "OFF"));
  const unifiedOverlayPanelOpen = !!diagramActionLayersOpen || !!diagramActionHybridToolsOpen;
  const closeDiagramPopovers = () => {
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
  };

  return (
    <>
      <div className="bpmnCanvasTools diagramActionBar" ref={diagramActionBarRef}>
        <button
          type="button"
          className={`primaryBtn h-8 px-2.5 text-xs ${unifiedOverlayPanelOpen || hybridVisible || drawioUiState.enabled ? "" : "opacity-95"}`}
          onClick={() => {
            const next = !unifiedOverlayPanelOpen;
            closeDiagramPopovers();
            setDiagramActionLayersOpen(next);
            setDiagramActionHybridToolsOpen(next);
          }}
          data-testid="diagram-action-layers"
        >
          <span>Draw.io / Overlay</span>
          <span className="diagramActionChip">
            {overlayStatusLabel}
          </span>
        </button>
        <span data-testid="templates-menu-button">
          <button
            type="button"
            className="secondaryBtn h-8 px-2 text-[11px]"
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
          className="secondaryBtn h-8 px-2 text-[11px]"
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
          className={`secondaryBtn h-8 px-2 text-[11px] ${activeQualityOverlayCount > 0 ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            const next = !diagramActionQualityOpen;
            closeDiagramPopovers();
            setDiagramActionQualityOpen(next);
          }}
          title="Проблемы на диаграмме"
          data-testid="diagram-action-quality"
        >
          Проблемы {activeQualityOverlayCount > 0 ? `(${activeQualityOverlayCount})` : ""}
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${diagramFocusMode ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramFocusMode((prev) => !prev);
            closeDiagramPopovers();
          }}
          title="Скрыть второстепенные панели и сфокусироваться на диаграмме"
          data-testid="diagram-action-focus-mode"
        >
          {diagramFocusMode ? "Выйти из фокуса" : "Фокус"}
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${diagramFullscreenActive ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            closeDiagramPopovers();
            void toggleDiagramFullscreen?.();
          }}
          title="Fullscreen диаграммы"
          data-testid="diagram-action-fullscreen-mode"
        >
          {diagramFullscreenActive ? "Выйти из fullscreen" : "Fullscreen"}
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 w-8 px-0 text-sm"
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
        <div className="diagramActionBarSpacer" />
        <button
          type="button"
          className="iconBtn"
          onClick={() => bpmnRef.current?.zoomOut?.()}
          disabled={!isBpmnTab}
          title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom out"}
          data-testid="diagram-zoom-out"
        >
          –
        </button>
        <button
          type="button"
          className="iconBtn"
          onClick={() => bpmnRef.current?.fit?.()}
          disabled={!isBpmnTab}
          title={!isBpmnTab ? "Доступно в Diagram/XML" : "Fit"}
          data-testid="diagram-zoom-fit"
        >
          ↔
        </button>
        <button
          type="button"
          className="iconBtn"
          onClick={() => bpmnRef.current?.zoomIn?.()}
          disabled={!isBpmnTab}
          title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom in"}
          data-testid="diagram-zoom-in"
        >
          +
        </button>
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

      {diagramActionPlaybackOpen ? (
        <div className="diagramActionPopover diagramActionPopover--playback" ref={diagramPlaybackPopoverRef} data-testid="diagram-action-playback-popover">
          <div className="diagramActionPopoverHead">
            <span>Process Playback</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => setDiagramActionPlaybackOpen(false)}
            >
              Закрыть
            </button>
          </div>
          {!!toText(playbackGraphError) ? (
            <div className="diagramActionPopoverEmpty">
              Graph error: {toText(playbackGraphError)}
            </div>
          ) : !playbackCanRun ? (
            <div className="diagramActionPopoverEmpty">
              Нет событий playback. Нажмите Reset.
            </div>
          ) : (
            <>
              <div className="diagramActionField">
                <span>Сценарий:</span>
                <b>{toText(playbackScenarioLabel) || "Scenario"}</b>
                <span className="muted small">path: {toText(executionPlanSource?.pathId) || "—"}</span>
              </div>
              <div className="diagramActionField">
                <span>Scenario selector</span>
                <select
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
              <div className="playbackDetailsLayout">
                <GatewaysPanel
                  gateways={playbackGateways}
                  choices={playbackGatewayChoices}
                  activeGatewayId={playbackAwaitingGatewayId}
                  onChangeChoice={(gatewayId, flowId) => {
                    setPlaybackGatewayChoice(gatewayId, flowId);
                    const pendingGatewayId = toText(playbackGatewayPending?.gatewayId || playbackGatewayPending?.nodeId);
                    if (pendingGatewayId && pendingGatewayId === toText(gatewayId) && toText(flowId)) {
                      handlePlaybackGatewayDecision(gatewayId, flowId);
                    }
                  }}
                />
                <div className="playbackDetailsCol">
                  <div className="muted mb-1 text-[11px]">Details</div>
                  <div className="diagramIssueRows">
                    <div className="diagramIssueRow">
                      <span>Event</span>
                      <b data-testid="diagram-action-playback-progress">
                        {Math.min(playbackIndexClamped + 1, Math.max(playbackTotal, 1))} / {playbackTotal}
                      </b>
                    </div>
                    <div className="diagramIssueRow">
                      <span className="truncate" title={playbackEventTitle(playbackCurrentEvent)}>
                        {playbackEventTitle(playbackCurrentEvent)}
                      </span>
                      <span className="muted small" data-testid="diagram-action-playback-event-type">
                        {toText(playbackCurrentEvent?.type) || "—"}
                      </span>
                    </div>
                    {toText(playbackCurrentEvent?.flowId) ? (
                      <div className="diagramIssueRow">
                        <span>flow</span>
                        <span className="diagramIssueChip">{toText(playbackCurrentEvent?.flowId)}</span>
                      </div>
                    ) : null}
                    {toText(playbackCurrentEvent?.nodeId || playbackCurrentEvent?.gatewayId) ? (
                      <div className="diagramIssueRow">
                        <span>node</span>
                        <span className="diagramIssueChip">
                          {toText(playbackCurrentEvent?.nodeId || playbackCurrentEvent?.gatewayId)}
                        </span>
                      </div>
                    ) : null}
                    {toText(playbackCurrentEvent?.reason) ? (
                      <div className="diagramIssueRow">
                        <span>reason</span>
                        <span className="diagramIssueChip">{toText(playbackCurrentEvent?.reason)}</span>
                      </div>
                    ) : null}
                    {toText(playbackCurrentEvent?.type) === "stop" ? (
                      <>
                        <div className="diagramIssueRow">
                          <span>steps</span>
                          <span className="diagramIssueChip">
                            {Number(asObject(playbackCurrentEvent?.metrics)?.stepsTotal || 0)}
                          </span>
                        </div>
                        <div className="diagramIssueRow">
                          <span>variations</span>
                          <span className="diagramIssueChip">
                            {Number(asObject(playbackCurrentEvent?.metrics)?.variationPoints || 0)}
                          </span>
                        </div>
                        <div className="diagramIssueRow">
                          <span>decisions</span>
                          <span className="diagramIssueChip">
                            m:{Number(asObject(playbackCurrentEvent?.metrics)?.manualDecisionsApplied || 0)}
                            {" / "}
                            a:{Number(asObject(playbackCurrentEvent?.metrics)?.autoDecisionsApplied || 0)}
                          </span>
                        </div>
                        <div className="diagramIssueRow">
                          <span>flows</span>
                          <span className="diagramIssueChip">
                            {Number(asObject(playbackCurrentEvent?.metrics)?.flowTransitions || 0)}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {asObject(playbackGatewayPending)?.type === "wait_for_gateway_decision" ? (
                    <div className="diagramIssueListWrap mt-2">
                      <div className="muted mb-1 text-[11px]">
                        Gateway: {formatPlaybackGatewayTitle(playbackGatewayPending)}
                      </div>
                      <div className="diagramActionPopoverActions">
                        {asArray(playbackGatewayPending?.outgoingOptions).map((optionRaw, index) => {
                          const option = asObject(optionRaw);
                          const flowId = toText(option?.flowId);
                          const label = playbackGatewayOptionLabel(option, index);
                          const targetHint = toText(option?.targetName || option?.targetId);
                          return (
                            <button
                              key={`playback_gateway_option_${flowId}`}
                              type="button"
                              className="secondaryBtn h-7 px-2 text-[11px]"
                              title={targetHint ? `→ ${targetHint}` : ""}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                markPlaybackOverlayInteraction({
                                  stage: "manual_gateway_button_mousedown",
                                  gatewayId: toText(playbackGatewayPending?.gatewayId),
                                  flowId,
                                });
                              }}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setPlaybackGatewayChoice(playbackGatewayPending?.gatewayId, flowId);
                                handlePlaybackGatewayDecision(playbackGatewayPending?.gatewayId, flowId);
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="diagramActionPopoverActions">
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={handlePlaybackPrev}
                  disabled={playbackIndexClamped <= 0}
                  data-testid="diagram-action-playback-prev"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={handlePlaybackTogglePlay}
                  data-testid="diagram-action-playback-play"
                >
                  {playbackIsPlaying ? "⏸ Pause" : "▶ Play"}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={handlePlaybackNext}
                  data-testid="diagram-action-playback-next"
                >
                  ⏭
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={startAutoPass}
                  disabled={!hasSession || autoPassBusy || autoPassBlocked}
                  data-testid="diagram-action-playback-auto"
                  title={autoPassBlockedReason || autoPassError || "Запустить автопроход"}
                >
                  {autoPassBusy ? "Авто…" : "Авто"}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={handlePlaybackReset}
                  data-testid="diagram-action-playback-reset"
                >
                  Reset
                </button>
              </div>
              <div className="diagramActionField">
                <span>Speed</span>
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
              <label className="diagramActionCheckboxRow mt-1">
                <input
                  type="checkbox"
                  checked={!!playbackManualAtGateway}
                  onChange={(event) => setPlaybackManualAtGateway(!!event.target.checked)}
                  data-testid="diagram-action-playback-manual-gateway"
                />
                <span>Manual at gateways</span>
              </label>
              <label className="diagramActionCheckboxRow mt-1">
                <input
                  type="checkbox"
                  checked={!!playbackAutoCamera}
                  onChange={(event) => setPlaybackAutoCamera(!!event.target.checked)}
                  data-testid="diagram-action-playback-autocamera"
                />
                <span>Auto-camera</span>
              </label>
              <div className="diagramIssueRow mt-1" title={autoPassBlockedReason || autoPassError || ""}>
                <span>Auto</span>
                <span className="diagramIssueChip" data-testid="diagram-action-playback-auto-status">
                  {autoPassLabel}
                  {autoPassBusy || autoPassStatus === "done" ? ` (${Math.max(0, Math.min(100, Math.round(autoPassProgress || (autoPassStatus === "done" ? 100 : 0))))}%)` : ""}
                </span>
              </div>
              {autoPassBlocked ? (
                <div className="diagramIssueRow mt-1" title={autoPassBlockedReason}>
                  <span>Auto precheck</span>
                  <span className="diagramIssueChip">{toText(autoPassBlockedReason)}</span>
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
        overlayPanelModel={overlayPanelModel}
        onDeleteOverlayEntity={deleteOverlayEntity}
        bpmnRef={bpmnRef}
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
