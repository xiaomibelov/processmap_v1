import LayersPopover from "../components/LayersPopover";
import HybridToolsPalette from "../../hybrid/tools/HybridToolsPalette";

export default function ProcessStageDiagramControls({ view = {} }) {
  const {
    tab,
    diagramActionBarRef,
    pathHighlightEnabled,
    setDiagramActionPathOpen,
    setDiagramActionHybridToolsOpen,
    setDiagramActionPlanOpen,
    setDiagramActionPlaybackOpen,
    setDiagramActionLayersOpen,
    setDiagramActionRobotMetaOpen,
    setRobotMetaListOpen,
    setDiagramActionQualityOpen,
    setDiagramActionOverflowOpen,
    pathHighlightBadge,
    hybridVisible,
    drawioUiState,
    toText,
    hybridV2ToolState,
    hybridModeEffective,
    openCreateTemplateModal,
    canCreateTemplateFromSelection,
    templateSelectionCount,
    openTemplatesPicker,
    canOpenTemplatesList,
    openSelectedElementNotes,
    canUseElementContextActions,
    openSelectedElementAi,
    openReportsFromDiagram,
    hasSession,
    diagramActionPlanOpen,
    executionPlanSource,
    diagramActionPlaybackOpen,
    playbackIsPlaying,
    playbackScenarioLabel,
    diagramActionLayersOpen,
    robotMetaOverlayEnabled,
    setRobotMetaOverlayEnabled,
    setRobotMetaOverlayFilters,
    robotMetaCounts,
    activeQualityOverlayCount,
    bpmnRef,
    isBpmnTab,
    diagramActionPathOpen,
    diagramPathPopoverRef,
    hasPathHighlightData,
    setPathHighlightEnabled,
    availablePathTiers,
    pathHighlightCatalog,
    pathHighlightTier,
    setPathHighlightTier,
    setPathHighlightSequenceKey,
    availableSequenceKeysForTier,
    pathHighlightSequenceKey,
    openPathsFromDiagram,
    diagramActionHybridToolsOpen,
    diagramHybridToolsPopoverRef,
    hybridToolsUiState,
    toggleHybridToolsVisible,
    selectHybridPaletteTool,
    setHybridToolsMode,
    openEmbeddedDrawioEditor,
    toggleDrawioEnabled,
    setDrawioOpacity,
    toggleDrawioLock,
    drawioFileInputRef,
    exportEmbeddedDrawio,
    diagramPlanPopoverRef,
    canExportExecutionPlan,
    executionPlanBusy,
    executionPlanPreview,
    asObject,
    asArray,
    executionPlanError,
    copyExecutionPlanFromDiagram,
    downloadExecutionPlanFromDiagram,
    saveExecutionPlanVersionFromDiagram,
    executionPlanSaveBusy,
    executionPlanVersions,
    shortHash,
    diagramPlaybackPopoverRef,
    playbackGraphError,
    playbackCanRun,
    playbackScenarioKey,
    setPlaybackScenarioKey,
    playbackScenarioOptions,
    playbackIndexClamped,
    playbackTotal,
    playbackCurrentEvent,
    playbackEventTitle,
    handlePlaybackPrev,
    handlePlaybackTogglePlay,
    handlePlaybackNext,
    handlePlaybackReset,
    playbackSpeed,
    setPlaybackSpeed,
    playbackManualAtGateway,
    setPlaybackManualAtGateway,
    playbackAutoCamera,
    setPlaybackAutoCamera,
    playbackGatewayPending,
    formatPlaybackGatewayTitle,
    playbackGatewayOptionLabel,
    markPlaybackOverlayInteraction,
    handlePlaybackGatewayDecision,
    diagramLayersPopoverRef,
    showHybridLayer,
    hideHybridLayer,
    focusHybridLayer,
    setHybridLayerMode,
    hybridUiPrefs,
    setHybridLayerOpacity,
    toggleHybridLayerLock,
    toggleHybridLayerFocus,
    hybridTotalCount,
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
    deleteSelectedHybridIds,
    deleteLegacyHybridMarkers,
    goToHybridLayerItem,
    diagramActionRobotMetaOpen,
    diagramRobotMetaPopoverRef,
    robotMetaOverlayFilters,
    toggleRobotMetaOverlayFilter,
    showRobotMetaOverlay,
    resetRobotMetaOverlay,
    robotMetaListOpen,
    diagramRobotMetaListRef,
    robotMetaListSearch,
    setRobotMetaListSearch,
    robotMetaListTab,
    setRobotMetaListTab,
    robotMetaListItems,
    focusRobotMetaItem,
    diagramActionQualityOpen,
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
    diagramActionOverflowOpen,
    diagramOverflowPopoverRef,
    selectedInsertBetween,
    openInsertBetweenModal,
    insertBetweenBusy,
    canInsertBetween,
    insertBetweenErrorMessage,
  } = view;

  if (tab !== "diagram") return null;

  return (
    <>
      <div className="bpmnCanvasTools diagramActionBar" ref={diagramActionBarRef}>
        <button
          type="button"
          className={`primaryBtn h-8 min-w-[124px] px-2.5 text-xs ${pathHighlightEnabled ? "" : "opacity-95"}`}
          onClick={() => {
            setDiagramActionPathOpen((prev) => !prev);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionPlaybackOpen(false);
            setDiagramActionLayersOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
            setDiagramActionOverflowOpen(false);
          }}
          data-testid="diagram-action-path-toggle"
        >
          <span>Подсветить путь</span>
          <span className="diagramActionChip">{pathHighlightEnabled ? pathHighlightBadge : "off"}</span>
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary ${(hybridVisible || drawioUiState.enabled) ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramActionHybridToolsOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionPlaybackOpen(false);
            setDiagramActionLayersOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
            setDiagramActionOverflowOpen(false);
          }}
          title="Hybrid Tools (Draw.io)"
          data-testid="diagram-action-hybrid-tools-toggle"
        >
          <span>Draw.io</span>
          <span className="diagramActionChip">{(drawioUiState.enabled || hybridVisible) ? (drawioUiState.enabled ? "full" : toText(hybridV2ToolState || hybridModeEffective || "on")) : "off"}</span>
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
          onClick={openCreateTemplateModal}
          disabled={!canCreateTemplateFromSelection}
          title={canCreateTemplateFromSelection ? "Сохранить выделенные BPMN элементы как шаблон" : "Выделите BPMN элементы на Diagram"}
          data-testid="template-pack-save-open"
        >
          {`Add template${templateSelectionCount > 0 ? ` (${templateSelectionCount})` : ""}`}
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
          onClick={() => {
            void openTemplatesPicker();
          }}
          disabled={!canOpenTemplatesList}
          title="Открыть список шаблонов"
          data-testid="template-pack-insert-open"
        >
          Templates
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
          onClick={openSelectedElementNotes}
          disabled={!canUseElementContextActions}
          title={canUseElementContextActions ? "Открыть Notes для выбранного элемента" : "Выберите элемент на диаграмме"}
          data-testid="diagram-action-notes"
        >
          Notes
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
          onClick={openSelectedElementAi}
          disabled={!canUseElementContextActions}
          title={canUseElementContextActions ? "Открыть AI-вопросы для выбранного элемента" : "Выберите элемент на диаграмме"}
          data-testid="diagram-action-ai"
        >
          AI
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
          onClick={openReportsFromDiagram}
          disabled={!hasSession}
          title="Открыть Reports для выбранного сценария"
          data-testid="diagram-action-reports"
        >
          Reports
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${diagramActionPlanOpen ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramActionPlanOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionPlaybackOpen(false);
            setDiagramActionLayersOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
            setDiagramActionOverflowOpen(false);
          }}
          title={`Экспорт плана: ${toText(executionPlanSource?.scenarioLabel) || "Scenario"}`}
          data-testid="diagram-action-export-plan"
        >
          Export Plan
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${diagramActionPlaybackOpen || playbackIsPlaying ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramActionPlaybackOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionLayersOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
            setDiagramActionOverflowOpen(false);
          }}
          title={`Проезд по сценарию: ${toText(playbackScenarioLabel) || "Scenario"}`}
          data-testid="diagram-action-playback"
        >
          ▶ Проезд
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${diagramActionLayersOpen || hybridVisible || drawioUiState.enabled ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramActionLayersOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
            setDiagramActionOverflowOpen(false);
          }}
          title="Управление Hybrid Layer"
          data-testid="diagram-action-layers"
        >
          Layers
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${robotMetaOverlayEnabled ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramActionRobotMetaOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionPlaybackOpen(false);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionLayersOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
            setDiagramActionOverflowOpen(false);
            setRobotMetaOverlayEnabled(true);
            setRobotMetaOverlayFilters((prev) => {
              const next = {
                ready: !!prev?.ready,
                incomplete: !!prev?.incomplete,
              };
              if (!next.ready && !next.incomplete) {
                return { ready: true, incomplete: true };
              }
              return next;
            });
          }}
          title="Подсветка готовности Robot Meta"
          data-testid="diagram-action-robotmeta"
        >
          Robot Meta {robotMetaOverlayEnabled ? `(${robotMetaCounts.ready}/${robotMetaCounts.incomplete})` : "off"}
        </button>
        <button
          type="button"
          className={`secondaryBtn h-8 px-2 text-[11px] ${activeQualityOverlayCount > 0 ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => {
            setDiagramActionQualityOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionPlaybackOpen(false);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionLayersOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionOverflowOpen(false);
          }}
          title="Проблемы на диаграмме"
          data-testid="diagram-action-quality"
        >
          Проблемы {activeQualityOverlayCount > 0 ? `(${activeQualityOverlayCount})` : ""}
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 w-8 px-0 text-sm"
          onClick={() => {
            setDiagramActionOverflowOpen((prev) => !prev);
            setDiagramActionPathOpen(false);
            setDiagramActionPlanOpen(false);
            setDiagramActionPlaybackOpen(false);
            setDiagramActionHybridToolsOpen(false);
            setDiagramActionLayersOpen(false);
            setDiagramActionRobotMetaOpen(false);
            setRobotMetaListOpen(false);
            setDiagramActionQualityOpen(false);
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

      <HybridToolsPalette
        open={diagramActionHybridToolsOpen}
        popoverRef={diagramHybridToolsPopoverRef}
        state={hybridToolsUiState}
        drawioState={drawioUiState}
        onToggleVisible={toggleHybridToolsVisible}
        onSetTool={selectHybridPaletteTool}
        onSetMode={setHybridToolsMode}
        onOpenDrawioEditor={openEmbeddedDrawioEditor}
        onToggleDrawioVisible={toggleDrawioEnabled}
        onSetDrawioOpacity={setDrawioOpacity}
        onToggleDrawioLock={toggleDrawioLock}
        onImportDrawio={() => drawioFileInputRef.current?.click?.()}
        onExportDrawio={exportEmbeddedDrawio}
        onClose={() => setDiagramActionHybridToolsOpen(false)}
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
            </>
          )}
        </div>
      ) : null}

      <LayersPopover
        open={diagramActionLayersOpen}
        popoverRef={diagramLayersPopoverRef}
        onClose={() => setDiagramActionLayersOpen(false)}
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
        onOpenHybridTools={() => {
          setDiagramActionHybridToolsOpen(true);
          setDiagramActionLayersOpen(false);
        }}
        setHybridLayerOpacity={setHybridLayerOpacity}
        toggleHybridLayerLock={toggleHybridLayerLock}
        toggleHybridLayerFocus={toggleHybridLayerFocus}
        drawioState={drawioUiState}
        onOpenDrawioEditor={openEmbeddedDrawioEditor}
        onToggleDrawioVisible={toggleDrawioEnabled}
        onSetDrawioOpacity={setDrawioOpacity}
        onToggleDrawioLock={toggleDrawioLock}
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
        deleteSelectedHybridIds={deleteSelectedHybridIds}
        deleteLegacyHybridMarkers={deleteLegacyHybridMarkers}
        bpmnRef={bpmnRef}
        goToHybridLayerItem={goToHybridLayerItem}
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
          <div className="diagramActionPopoverActions">
            {selectedInsertBetween ? (
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={openInsertBetweenModal}
                disabled={insertBetweenBusy || !canInsertBetween}
                title={canInsertBetween ? "Вставить шаг между" : insertBetweenErrorMessage(selectedInsertBetween?.error)}
              >
                Вставить между
              </button>
            ) : (
              <div className="diagramActionPopoverEmpty">Дублирующих действий нет.</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
