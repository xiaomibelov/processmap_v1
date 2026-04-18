import ProcessPanels from "./ProcessPanels";
import { getFirstPickedFile } from "./fileInputEvent.js";
import { resolvePublishedRevisionBadgeView } from "./revisionBadgePolicy.js";
import { getPublishGitMirrorMeta } from "../../../../shared/publishGitMirrorStatus";

function toText(value) {
  return String(value || "").trim();
}

export default function ProcessStageHeader({ view = {} }) {
  const {
    canSaveNow,
    saveDirtyHint,
    saveActionText,
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
    publishGitMirrorSnapshot,
    sessionPresenceView,
    remoteSaveHighlightView,
  } = view;
  const latestPublishedRevisionNumber = Number(sessionRevisionHistorySnapshot?.latestPublishedRevisionNumber || 0);
  const hasPublishedRevision = latestPublishedRevisionNumber > 0;
  const publishedRevisionBadge = resolvePublishedRevisionBadgeView(sessionRevisionHistorySnapshot);
  const draftAheadOfLatest = sessionRevisionHistorySnapshot?.draftState?.isDraftAheadOfLatestRevision === true;
  const showDraftRelationBadge = hasPublishedRevision || draftAheadOfLatest;
  const draftStatusLabel = draftAheadOfLatest
    ? "Черновик новее последней версии"
    : "Черновик совпадает с последней версией";
  const draftStatusTitle = draftAheadOfLatest
    ? "В черновике есть изменения, которые ещё не попали в опубликованную историю."
    : "Черновик синхронизирован с последней опубликованной версией.";
  const draftStatusTone = draftAheadOfLatest ? "warn" : "ok";
  const mirrorSnapshot = (
    publishGitMirrorSnapshot && typeof publishGitMirrorSnapshot === "object"
      ? publishGitMirrorSnapshot
      : {}
  );
  const mirrorMeta = getPublishGitMirrorMeta(mirrorSnapshot.state);
  const mirrorVersionNumberRaw = Number(mirrorSnapshot.versionNumber);
  const mirrorVersionNumber = Number.isFinite(mirrorVersionNumberRaw)
    ? Math.max(0, Math.trunc(mirrorVersionNumberRaw))
    : 0;
  const mirrorVersionId = String(mirrorSnapshot.versionId || "").trim();
  const mirrorLastError = String(mirrorSnapshot.lastError || "").trim();
  const mirrorVersionLabel = mirrorVersionNumber > 0
    ? `v${String(mirrorVersionNumber)}`
    : mirrorVersionId;
  const mirrorBadgeLabel = mirrorVersionLabel
    ? `${mirrorMeta.label} · ${mirrorVersionLabel}`
    : mirrorMeta.label;
  const saveStatusText = toText(saveSmartText);
  const showSaveStatusBadge = hasSession && !!saveStatusText && saveStatusText !== "Сохранить сессию";
  const isConflictState = toText(saveUploadStatus?.state) === "conflict";
  const hasDominantConflictState = isConflictState;
  const showConflictModalActive = isConflictState && saveConflictActions?.visible === true;
  const showDraftRelationBadgeResolved = showDraftRelationBadge && !hasDominantConflictState;
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
    || toolbarMessageNormalized === "черновик синхронизирован"
  );
  const hasPrimaryDraftStatusSurface = showSaveStatusBadgeResolved || showDraftRelationBadgeResolved;
  const toolbarMessageLooksLikeConflict = /(?:конфликт|conflict|http\s*409|stale|верси)/i.test(toolbarMessage);
  const showToolbarInlineBadge = !!toolbarInlineMessage
    && !hasDominantConflictState
    && !(showConflictModalActive && toolbarMessageLooksLikeConflict)
    && !(
      isDraftSavedToolbarMessage
      && hasPrimaryDraftStatusSurface
      && (
        !saveSmartTextNormalized
        || toolbarMessageNormalized === saveSmartTextNormalized
        || saveSmartTextNormalized === "черновик сохранён"
      )
    );
  const suppressDraftSavedBadge = /^Сессия (?:уже )?сохранена(?:[:.].*)?$/i.test(toolbarMessage)
    && toText(saveSmartText) === "Черновик сохранён";
  const showGenericSaveStatusBadge = showSaveStatusBadgeResolved
    && !suppressDraftSavedBadge
    && !showDraftRelationBadgeResolved;
  const publishActionRequired = draftAheadOfLatest
    || (latestPublishedRevisionNumber <= 0 && sessionRevisionHistorySnapshot?.draftState?.hasLiveDraft === true);
  const canCreateRevisionFromCurrentState = canSaveNow
    && (saveDirtyHint || publishActionRequired)
    && typeof handleCreateRevisionAction === "function";
  const revisionActionTitle = !canSaveNow
    ? "Создание ревизии доступно в Diagram/XML"
    : (
      saveDirtyHint || publishActionRequired
        ? "Создать новую ревизию из текущего состояния сессии"
        : "Новых изменений для новой ревизии нет. Измените схему и попробуйте снова."
    );
  const canRunUndo = tab === "diagram" && canUndo === true;
  const canRunRedo = tab === "diagram" && canRedo === true;

  return (
    <div className="processHeader diagramToolbarHeader">
      <div className="diagramToolbarSlot diagramToolbarSlot--left">
        <div className="flex items-center gap-2">
          {hasSession ? (
            <button
              type="button"
              className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
              onClick={handleSaveCurrentTab}
              title={workbench.saveTooltip}
              data-testid="diagram-toolbar-save"
            >
              {saveActionText || "Сохранить сессию"}
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
          {hasSession ? (
            <button
              type="button"
              className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
              onClick={handleCreateRevisionAction}
              disabled={!canCreateRevisionFromCurrentState}
              title={revisionActionTitle}
              data-testid="diagram-toolbar-create-revision"
            >
              Создать новую ревизию
            </button>
          ) : null}
          {hasSession ? (
            <>
              <span
                className="badge text-[11px] text-muted"
                data-testid={publishedRevisionBadge.testId}
                title={publishedRevisionBadge.title || undefined}
              >
                {publishedRevisionBadge.text}
              </span>
              {showDraftRelationBadgeResolved ? (
                <span
                  className={`badge text-[11px] ${draftStatusTone}`}
                  data-testid="diagram-toolbar-draft-vs-latest"
                  title={draftStatusTitle}
                >
                  {draftStatusLabel}
                </span>
              ) : null}
            </>
          ) : null}
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
          {showGenericSaveStatusBadge ? (
            <span className="badge text-[11px] text-muted" data-testid="diagram-toolbar-save-status" title={saveSmartText}>
              {saveSmartText}
            </span>
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
          {hasSession ? (
            <span
              className={`badge text-[11px] ${mirrorMeta.processTone}`}
              data-testid="diagram-toolbar-publish-git-mirror-status"
              title={mirrorLastError || "Статус синхронизации Git-зеркала"}
            >
              Git-зеркало: {mirrorBadgeLabel}
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
