import ProcessPanels from "./ProcessPanels";
import { getFirstPickedFile } from "./fileInputEvent.js";
import { getPublishGitMirrorMeta } from "../../../../shared/publishGitMirrorStatus";

export default function ProcessStageHeader({ view = {} }) {
  const {
    canSaveNow,
    saveDirtyHint,
    showSaveActionButton,
    saveActionText,
    saveSmartText,
    saveUploadStatus,
    sessionRevisionHistorySnapshot,
    handleSaveCurrentTab,
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
            ) : (
              <span className="badge text-[11px] text-muted" data-testid="diagram-toolbar-save-status">
                {saveSmartText}
              </span>
            )
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
              {latestRevisionNumber > 0 ? (
                <span className="badge text-[11px] text-muted" data-testid="diagram-toolbar-latest-revision">
                  r{latestRevisionNumber}
                </span>
              ) : (
                <span className="badge text-[11px] text-muted" data-testid="diagram-toolbar-latest-revision-empty">
                  R0
                </span>
              )}
              <span
                className={`badge text-[11px] ${draftStatusTone}`}
                data-testid="diagram-toolbar-draft-vs-latest"
              >
                {draftStatusLabel}
              </span>
              <span
                className={`badge text-[11px] ${mirrorMeta.processTone}`}
                data-testid="diagram-toolbar-publish-git-mirror-status"
                title={mirrorLastError || "Статус синхронизации Git-зеркала"}
              >
                Git-зеркало: {mirrorBadgeLabel}
              </span>
            </>
          ) : null}
          {saveUploadStatus?.visible ? (
            <span
              className={`badge text-[11px] ${String(saveUploadStatus?.tone || "").trim()}`}
              data-testid="diagram-toolbar-save-upload-status"
              title={String(saveUploadStatus?.title || saveUploadStatus?.label || "")}
            >
              {String(saveUploadStatus?.label || "")}
            </span>
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
        {null}
        {toolbarInlineMessage ? (
          <span
            className={`badge hidden max-w-[36ch] truncate lg:inline-flex ${toolbarInlineTone ? toolbarInlineTone : ""}`}
            title={toolbarInlineMessage}
          >
            {toolbarInlineMessage}
          </span>
        ) : null}
        {null}
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
