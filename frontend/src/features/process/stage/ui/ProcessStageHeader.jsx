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
    showSaveActionButton,
    saveActionText,
    saveSmartText,
    saveUploadStatus,
    saveConflictActions,
    sessionRevisionHistorySnapshot,
    handleSaveCurrentTab,
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
  } = view;
  const latestRevisionNumber = Number(sessionRevisionHistorySnapshot?.latestRevisionNumber || 0);
  const hasPublishedRevision = latestRevisionNumber > 0;
  const publishedRevisionBadge = resolvePublishedRevisionBadgeView(sessionRevisionHistorySnapshot);
  const draftAheadOfLatest = sessionRevisionHistorySnapshot?.draftState?.isDraftAheadOfLatestRevision === true;
  const draftStatusLabel = !hasPublishedRevision
    ? "Ревизий нет"
    : (draftAheadOfLatest ? "Черновик" : "Опубликовано");
  const draftStatusTone = !hasPublishedRevision || draftAheadOfLatest ? "warn" : "ok";
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
  const showSaveStatusBadge = canSaveNow && !showSaveActionButton;
  const isConflictState = toText(saveUploadStatus?.state) === "conflict";
  const conflictMeta = isConflictState ? (saveUploadStatus?.conflict || {}) : {};
  const conflictVersionSummary = (
    Number(conflictMeta?.serverCurrentVersion || 0) > 0 || Number(conflictMeta?.clientBaseVersion || 0) > 0
      ? `srv ${Number(conflictMeta?.serverCurrentVersion || 0) || "?"} / base ${Number(conflictMeta?.clientBaseVersion || 0) || "?"}`
      : ""
  );
  const conflictKeysSummary = Array.isArray(conflictMeta?.changedKeys) && conflictMeta.changedKeys.length
    ? ` · ${conflictMeta.changedKeys.slice(0, 3).join(", ")}`
    : "";
  const conflictSummaryText = ([
    "Конфликт версии BPMN",
    conflictVersionSummary ? `(${conflictVersionSummary})` : "",
    conflictKeysSummary,
  ].join(" ")).replace(/\s+/g, " ").trim();
  const showConflictActions = isConflictState && saveConflictActions?.visible === true;
  const saveConflictBusy = saveConflictActions?.busy === true;
  const showUploadStatusBadge = saveUploadStatus?.visible && !showConflictActions;
  const toolbarMessage = toText(toolbarInlineMessage);
  const toolbarMessageLooksLikeConflict = /(?:конфликт|conflict|http\s*409|stale|верси)/i.test(toolbarMessage);
  const showToolbarInlineBadge = !!toolbarInlineMessage && !(showConflictActions && toolbarMessageLooksLikeConflict);
  const showSaveStatusBadgeResolved = showSaveStatusBadge && !showConflictActions;
  const suppressDraftSavedBadge = /^Опубликовано как версия R\d+\.$/.test(toolbarMessage)
    && toText(saveSmartText) === "Черновик сохранён";
  const showGenericSaveStatusBadge = showSaveStatusBadgeResolved && !suppressDraftSavedBadge;
  const canRunUndo = tab === "diagram" && canUndo === true;
  const canRunRedo = tab === "diagram" && canRedo === true;

  return (
    <div className="processHeader diagramToolbarHeader">
      <div className="diagramToolbarSlot diagramToolbarSlot--left">
        <div className="flex items-center gap-2">
          {canSaveNow ? (
            showSaveActionButton ? (
              <button
                type="button"
                className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                onClick={handleSaveCurrentTab}
                title={workbench.saveTooltip}
                data-testid="diagram-toolbar-save"
              >
                {saveActionText || saveSmartText}
              </button>
            ) : null
          ) : (
              <button
                type="button"
                className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                disabled
                title={workbench.saveTooltip}
              >
                {saveSmartText || workbench.labels.save}
              </button>
            )}
          {hasSession ? (
            <>
              <span
                className="badge text-[11px] text-muted"
                data-testid={publishedRevisionBadge.testId}
                title={publishedRevisionBadge.title || undefined}
              >
                {publishedRevisionBadge.text}
              </span>
              <span
                className={`badge text-[11px] ${draftStatusTone}`}
                data-testid="diagram-toolbar-draft-vs-latest"
              >
                {draftStatusLabel}
              </span>
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
        {showConflictActions ? (
          <div
            className="mt-1 flex flex-wrap items-start gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-2 py-1"
            data-testid="diagram-toolbar-save-conflict-panel"
          >
            <div className="max-w-[52ch] text-[11px] leading-4">
              <div className="font-semibold text-rose-900" data-testid="diagram-toolbar-save-conflict-title">
                {conflictSummaryText || "Конфликт версии BPMN"}
              </div>
              {toText(saveUploadStatus?.title) ? (
                <div
                  className="text-rose-800"
                  data-testid="diagram-toolbar-save-conflict-context"
                  title={String(saveUploadStatus?.title || "")}
                >
                  {String(saveUploadStatus?.title || "")}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={saveConflictActions?.onRefreshSession}
              disabled={saveConflictBusy}
              data-testid="diagram-toolbar-save-conflict-refresh"
            >
              Обновить сессию
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={saveConflictActions?.onStay}
              disabled={saveConflictBusy}
              data-testid="diagram-toolbar-save-conflict-stay"
            >
              Остаться
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={saveConflictActions?.onDiscardLocalChanges}
              disabled={saveConflictBusy}
              data-testid="diagram-toolbar-save-conflict-discard"
              title="Отбросить локальные изменения и загрузить серверную версию"
            >
              Отбросить локальные изменения
            </button>
          </div>
        ) : null}
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
