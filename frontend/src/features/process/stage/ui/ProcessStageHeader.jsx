import ProcessPanels from "./ProcessPanels";
import { getFirstPickedFile } from "./fileInputEvent.js";
import { resolvePublishedRevisionBadgeView } from "./revisionBadgePolicy.js";

function toText(value) {
  return String(value || "").trim();
}

export default function ProcessStageHeader({ view = {} }) {
  const {
    canCreateRevisionNow,
    createRevisionNoDiffHintVisible,
    createRevisionNoDiffHintText,
    saveActionText,
    createRevisionActionText,
    saveSmartText,
    saveUploadStatus,
    saveConflictActions,
    sessionRevisionHistorySnapshot,
    handleSaveCurrentTab,
    handleCreateRevisionAction,
    handleUndoAction,
    handleRedoAction,
    canUndo,
    canRedo,
    workbench,
    tab,
    isSwitchingTab,
    isFlushingTab,
    switchTab,
    hasSession,
    attentionOpen,
    toggleAttentionPanel,
    attentionItemsRaw,
    toolbarInlineMessage,
    toolbarInlineTone,
    doGenerate,
    toolbarMenuButtonRef,
    toggleToolbarMenu,
    toolbarMenuOpen,
    importInputRef,
    onImportPicked,
    hybridV2FileInputRef,
    handleHybridV2ImportFile,
    drawioFileInputRef,
    handleDrawioImportFile,
    topPanelsView,
    sessionPresenceView,
    remoteSaveHighlightView,
  } = view;
  const publishedRevisionBadge = resolvePublishedRevisionBadgeView(sessionRevisionHistorySnapshot);
  const latestPublishedRevisionNumber = Number(sessionRevisionHistorySnapshot?.latestPublishedRevisionNumber || 0);
  const latestRevisionNumber = Number(sessionRevisionHistorySnapshot?.latestRevisionNumber || 0);
  const resolvedVersionNumber = latestPublishedRevisionNumber > 0
    ? latestPublishedRevisionNumber
    : (latestRevisionNumber > 0 ? latestRevisionNumber : 0);
  const versionChipLabel = resolvedVersionNumber > 0 ? `V. ${resolvedVersionNumber}` : "V. —";
  const versionChipTitle = resolvedVersionNumber > 0
    ? `Текущая версия: ${resolvedVersionNumber}`
    : (publishedRevisionBadge.title || "Версия пока не создана.");
  const resolvedSaveActionText = toText(saveActionText) || "Сохранить сессию";
  const resolvedCreateRevisionActionText = toText(createRevisionActionText) || "Создать версию BPMN";
  const saveStatusText = toText(saveSmartText);
  const showSaveStatusBadge = hasSession && !!saveStatusText && saveStatusText !== "Сохранить сессию";
  const isConflictState = toText(saveUploadStatus?.state) === "conflict";
  const hasDominantConflictState = isConflictState;
  const showConflictModalActive = isConflictState && saveConflictActions?.visible === true;
  const showSaveStatusBadgeResolved = showSaveStatusBadge && !hasDominantConflictState;
  const uploadStatusState = toText(saveUploadStatus?.state);
  const showUploadStatusBadge = saveUploadStatus?.visible
    && !showConflictModalActive
    && (uploadStatusState === "save_failed" || uploadStatusState === "conflict");
  const showSessionPresenceBadge = hasSession && sessionPresenceView?.visible === true && !showConflictModalActive;
  const showRemoteSaveHighlightBadge = remoteSaveHighlightView?.visible === true && !showConflictModalActive;
  const showRemoteSaveRefreshAction = showRemoteSaveHighlightBadge && typeof remoteSaveHighlightView?.onRefreshSession === "function";
  const toolbarMessage = toText(toolbarInlineMessage);
  const toolbarMessageNormalized = toolbarMessage.replace(/[.!]+$/g, "").trim().toLowerCase();
  const saveSmartTextNormalized = toText(saveSmartText).replace(/[.!]+$/g, "").trim().toLowerCase();
  const isDraftSavedToolbarMessage = (
    toolbarMessageNormalized === "черновик сохранён"
    || toolbarMessageNormalized === "сохранено внутри версии"
    || toolbarMessageNormalized === "черновик синхронизирован"
  );
  const isSaveVersionToolbarMessage = (
    isDraftSavedToolbarMessage
    || toolbarMessageNormalized === "создана новая версия bpmn"
    || toolbarMessageNormalized === "версия bpmn не создана: нет изменений bpmn"
  );
  const hasPrimaryDraftStatusSurface = showSaveStatusBadgeResolved;
  const toolbarMessageLooksLikeConflict = /(?:конфликт|conflict|http\s*409|stale|верси)/i.test(toolbarMessage);
  const showToolbarInlineBadge = !!toolbarInlineMessage
    && !isSaveVersionToolbarMessage
    && !hasDominantConflictState
    && !(showConflictModalActive && toolbarMessageLooksLikeConflict)
    && !(
      isDraftSavedToolbarMessage
      && hasPrimaryDraftStatusSurface
      && (
        !saveSmartTextNormalized
        || toolbarMessageNormalized === saveSmartTextNormalized
        || saveSmartTextNormalized === "черновик сохранён"
        || saveSmartTextNormalized === "сохранено внутри версии"
      )
    );
  const showGenericSaveStatusBadge = showSaveStatusBadgeResolved;
  const canCreateRevisionFromCurrentState = canCreateRevisionNow !== false
    && typeof handleCreateRevisionAction === "function";
  const showCreateRevisionNoDiffHint = hasSession
    && createRevisionNoDiffHintVisible === true;
  const revisionActionTitle = showCreateRevisionNoDiffHint
    ? "Версия BPMN не будет создана: нет изменений BPMN после последней версии."
    : (!canCreateRevisionFromCurrentState
      ? "Создание версии BPMN временно недоступно."
      : "Создать версию BPMN из текущей схемы.");
  const canRunUndo = tab === "diagram" && canUndo === true;
  const canRunRedo = tab === "diagram" && canRedo === true;

  return (
    <div className="processHeader diagramToolbarHeader">
      <div className="diagramToolbarSlot diagramToolbarSlot--left">
        <div className="flex items-center gap-2">
          {hasSession ? (
            <span
              className="badge text-[11px] info"
              data-testid="diagram-toolbar-version-chip"
              title={versionChipTitle}
            >
              {versionChipLabel}
            </span>
          ) : null}
          {hasSession ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                onClick={handleCreateRevisionAction}
                disabled={!canCreateRevisionFromCurrentState}
                title={revisionActionTitle}
                data-testid="diagram-toolbar-create-revision"
              >
                {resolvedCreateRevisionActionText}
              </button>
              {showCreateRevisionNoDiffHint ? (
                <span
                  className="badge text-[11px] text-muted"
                  title={revisionActionTitle}
                  data-testid="diagram-toolbar-create-revision-no-diff-hint"
                >
                  {toText(createRevisionNoDiffHintText) || "Нет изменений BPMN после последней версии"}
                </span>
              ) : null}
            </div>
          ) : null}
          {hasSession ? (
            <button
              type="button"
              className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
              onClick={handleSaveCurrentTab}
              title={workbench.saveTooltip}
              data-testid="diagram-toolbar-save"
            >
              {resolvedSaveActionText}
            </button>
          ) : (
              <button
                type="button"
                className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                disabled
                title={workbench.saveTooltip}
              >
                {workbench.labels.save}
              </button>
            )}
        </div>
      </div>

      <div className="diagramToolbarSlot diagramToolbarSlot--center">
        <div className="seg" role="tablist" aria-label="Process tabs" aria-orientation="horizontal">
          {workbench.tabs.map((x) => {
            const isEnabled = !!hasSession && !isSwitchingTab && !isFlushingTab;
            const isActive = isEnabled && tab === x.id;
            const isDisabled = !isEnabled;
            return (
            <button
              type="button"
              key={x.id}
              className={`segBtn rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${isActive ? "on bg-accent text-white" : isDisabled ? "isDisabled text-muted" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              tabIndex={isActive ? 0 : -1}
              disabled={!hasSession || isSwitchingTab || isFlushingTab}
              onClick={async () => {
                await switchTab(x.id);
              }}
            >
              {x.label}
            </button>
            );
          })}
        </div>
      </div>

      <div className="diagramToolbarSlot diagramToolbarSlot--right">
        <div className="diagramToolbarRightStatus">
          <span
            className="diagramToolbarNotificationAnchor"
            data-testid="diagram-toolbar-notification-anchor"
            aria-hidden="true"
          />
          {showSessionPresenceBadge ? (
            <span
              className="badge text-[11px] text-muted"
              data-testid="diagram-toolbar-session-presence"
              title={String(sessionPresenceView?.title || "")}
            >
              {String(sessionPresenceView?.label || "")}
            </span>
          ) : null}
          {showRemoteSaveHighlightBadge ? (
            <>
              <span
                className="badge text-[11px] info"
                data-testid="diagram-toolbar-remote-save-highlight"
                title={String(remoteSaveHighlightView?.title || remoteSaveHighlightView?.label || "")}
              >
                {String(remoteSaveHighlightView?.label || "")}
              </span>
              {showRemoteSaveRefreshAction ? (
                <button
                  type="button"
                  className="secondaryBtn h-7 whitespace-nowrap px-2 text-[11px]"
                  onClick={() => void remoteSaveHighlightView?.onRefreshSession?.()}
                  disabled={remoteSaveHighlightView?.busy === true}
                  title={String(remoteSaveHighlightView?.refreshHint || "")}
                  data-testid="diagram-toolbar-remote-save-refresh"
                >
                  {remoteSaveHighlightView?.busy === true
                    ? "Обновляем..."
                    : String(remoteSaveHighlightView?.refreshLabel || "Обновить сессию")}
                </button>
              ) : null}
            </>
          ) : null}
          {showUploadStatusBadge ? (
            <span
              className={`badge text-[11px] ${String(saveUploadStatus?.tone || "").trim()}`}
              data-testid="diagram-toolbar-save-upload-status"
              title={String(saveUploadStatus?.title || saveUploadStatus?.label || "")}
            >
              {String(saveUploadStatus?.label || "")}
            </span>
          ) : null}
        </div>
        {showToolbarInlineBadge ? (
          <span
            className={`badge hidden max-w-[36ch] truncate lg:inline-flex ${toolbarInlineTone ? toolbarInlineTone : ""}`}
            title={toolbarInlineMessage}
          >
            {toolbarInlineMessage}
          </span>
        ) : null}
        <div className="diagramToolbarRightActions">
          {hasSession ? (
            <>
              <button
                type="button"
                className="secondaryBtn h-8 w-8 px-0 text-base leading-none"
                onClick={handleUndoAction}
                disabled={!canRunUndo}
                title="Шаг назад"
                aria-label="Шаг назад"
                data-testid="diagram-toolbar-undo"
              >
                <span aria-hidden="true">↶</span>
              </button>
              <button
                type="button"
                className="secondaryBtn h-8 w-8 px-0 text-base leading-none"
                onClick={handleRedoAction}
                disabled={!canRunRedo}
                title="Повторить отменённое действие"
                aria-label="Повторить отменённое действие"
                data-testid="diagram-toolbar-redo"
              >
                <span aria-hidden="true">↷</span>
              </button>
            </>
          ) : null}
          <button
            ref={toolbarMenuButtonRef}
            type="button"
            className="secondaryBtn h-8 w-9 px-0 text-sm"
            onClick={toggleToolbarMenu}
            aria-expanded={toolbarMenuOpen ? "true" : "false"}
            aria-label="Открыть меню действий"
            data-testid="diagram-toolbar-overflow-toggle"
          >
            ⋯
          </button>
        </div>
      </div>

      <input ref={importInputRef} type="file" accept=".bpmn,.xml,text/xml,application/xml" style={{ display: "none" }} onChange={onImportPicked} />
      <input
        ref={hybridV2FileInputRef}
        type="file"
        accept=".drawio,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        data-testid="hybrid-v2-import-input"
        onChange={(event) => {
          const file = getFirstPickedFile(event);
          if (file) {
            void handleHybridV2ImportFile(file);
          }
          if (event?.target) event.target.value = "";
        }}
      />
      <input
        ref={drawioFileInputRef}
        type="file"
        accept=".drawio,.xml,text/xml,application/xml"
        style={{ display: "none" }}
        data-testid="drawio-import-input"
        onChange={(event) => {
          const file = getFirstPickedFile(event);
          if (file) {
            void handleDrawioImportFile(file);
          }
          if (event?.target) event.target.value = "";
        }}
      />

      <ProcessPanels section="top" view={topPanelsView} />
    </div>
  );
}
