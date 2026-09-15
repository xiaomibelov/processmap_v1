import Modal from "../../../../shared/ui/Modal";
import CreateTemplateModal from "../../../templates/ui/CreateTemplateModal";
import { resolveRevisionHistoryEmptyState } from "./revisionHistoryUiModel";
import BpmnVersionActions from "./BpmnVersionActions";
import BpmnVersionList from "./BpmnVersionList";
import BpmnVersionComparePane from "./BpmnVersionComparePane";
import BpmnVersionCompareHeader from "./BpmnVersionCompareHeader";

export default function ProcessDialogs({ view = {} }) {
  const {
    qualityAutoFixOpen,
    qualityAutoFixBusy,
    closeQualityAutoFix,
    applyQualityAutoFix,
    qualityAutoFixPreview,
    qualityProfile,
    qualityProfileId,
    asArray,
    insertBetweenOpen,
    insertBetweenBusy,
    closeInsertBetweenDialog,
    applyInsertBetweenFromDiagram,
    insertBetweenName,
    setInsertBetweenName,
    insertBetweenDraft,
    createTemplateOpen,
    templatesBusy,
    closeCreateTemplateDialog,
    createTemplateTitle,
    setCreateTemplateTitle,
    createTemplateScope,
    setCreateTemplateScope,
    createTemplateType,
    setCreateTemplateType,
    workspaceActiveOrgId,
    canCreateOrgTemplates,
    canCreateOrgFolders,
    selectedBpmnElementIds,
    selectedHybridTemplateCount,
    createTemplateFolders,
    createTemplateFolderId,
    setCreateTemplateFolderId,
    createTemplateFolderFromModal,
    saveCurrentSelectionAsTemplate,
    versionsOpen,
    closeVersionsDialog,
    refreshSnapshotVersions,
    versionsBusy,
    versionsList,
    versionsLoadState,
    versionsLoadError,
    versionsUserFacingCount,
    versionsServerEntriesCount,
    versionsTechnicalEntriesCount,
    versionsTotalCount,
    versionsHasMore,
    versionsLoadingMore,
    versionsIncludeTechnical,
    loadMoreSnapshotVersions,
    toggleVersionsIncludeTechnical,
    isAdmin,
    previewSnapshotId,
    versionSelection,
    onVersionPreview,
    onVersionAssign,
    versionPaneSingle,
    versionPaneA,
    versionPaneB,
    versionCompareCounts,
    versionCompareBusy,
    versionCompareNoChanges,
    versionCompareMode,
    onVersionCompareModeChange,
    versionCompareShowPositional,
    onVersionCompareTogglePositional,
    getVersionDiffSummary,
  } = view;
  const userFacingVersionsCount = Math.max(
    Number(versionsUserFacingCount || 0),
    Array.isArray(versionsList) ? versionsList.length : 0,
  );
  const revisionEmptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: versionsLoadState,
    meaningfulCountRaw: userFacingVersionsCount,
    technicalCountRaw: Number(versionsTechnicalEntriesCount || 0),
    serverEntriesCountRaw: Number(versionsServerEntriesCount || 0),
  });

  const compareActive = !!(versionSelection?.compareAId && versionSelection?.compareBId);
  const versionCount = Array.isArray(versionsList) ? versionsList.length : 0;
  const showSecondVersionHint = !compareActive && versionCount === 1;

  return (
    <>
      <Modal
        open={qualityAutoFixOpen}
        title="Автоисправление качества"
        onClose={() => {
          if (qualityAutoFixBusy) return;
          closeQualityAutoFix();
        }}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={closeQualityAutoFix}
              disabled={qualityAutoFixBusy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="primaryBtn"
              onClick={() => void applyQualityAutoFix()}
              disabled={qualityAutoFixBusy || Number(qualityAutoFixPreview?.safeFixes || 0) <= 0}
              data-testid="quality-autofix-apply"
            >
              {qualityAutoFixBusy ? "Применение..." : `Автоисправить (${Number(qualityAutoFixPreview?.safeFixes || 0)})`}
            </button>
          </>
        )}
      >
        <div className="space-y-3" data-testid="quality-autofix-modal">
          <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-xs text-muted">
            Профиль: <b className="text-fg">{qualityProfile?.title || qualityProfileId}</b>
            <span> · safe fixes: <b className="text-fg">{Number(qualityAutoFixPreview?.safeFixes || 0)}</b></span>
            <span> · всего пунктов: <b className="text-fg">{asArray(qualityAutoFixPreview?.fixes).length}</b></span>
          </div>
          <div className="max-h-[48vh] space-y-2 overflow-auto pr-1">
            {asArray(qualityAutoFixPreview?.fixes).length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
                Нет автоисправлений для текущих проблем.
              </div>
            ) : (
              asArray(qualityAutoFixPreview?.fixes).map((fix) => (
                <div key={String(fix?.id || "")} className="rounded-md border border-border bg-panel px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <b className="text-fg">{String(fix?.title || "Fix")}</b>
                    <span className={`badge px-1.5 py-0 text-[10px] ${fix?.safe ? "ok" : "warn"}`}>{fix?.safe ? "safe" : "warn"}</span>
                    <span className="badge px-1.5 py-0 text-[10px]">{String(fix?.ruleId || "generic")}</span>
                    <span className="font-mono text-[11px] text-muted">{String(fix?.target || "")}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{String(fix?.detail || "")}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={insertBetweenOpen}
        title="Вставить шаг между"
        onClose={() => {
          if (insertBetweenBusy) return;
          closeInsertBetweenDialog();
        }}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={closeInsertBetweenDialog}
              disabled={insertBetweenBusy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="primaryBtn"
              onClick={() => void applyInsertBetweenFromDiagram()}
              disabled={insertBetweenBusy || !String(insertBetweenName || "").trim()}
              data-testid="diagram-insert-between-confirm"
            >
              {insertBetweenBusy ? "Применение..." : "Вставить"}
            </button>
          </>
        )}
      >
        <div className="space-y-3" data-testid="diagram-insert-between-modal">
          <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-xs text-muted">
            <div>
              Связь: <b className="font-mono text-fg">{String(insertBetweenDraft?.fromId || "")}</b> →{" "}
              <b className="font-mono text-fg">{String(insertBetweenDraft?.toId || "")}</b>
            </div>
            <div>
              Lane: <b className="text-fg">{String(insertBetweenDraft?.laneName || insertBetweenDraft?.laneId || "auto")}</b>
            </div>
            <div>
              Условие перехода переносится на <b className="text-fg">A→C</b>.
            </div>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted">Название нового шага</span>
            <input
              className="input w-full"
              value={insertBetweenName}
              onChange={(e) => setInsertBetweenName(String(e.target.value || ""))}
              placeholder="Например: Проверка качества"
              data-testid="diagram-insert-between-name"
            />
          </label>
        </div>
      </Modal>

      <CreateTemplateModal
        open={createTemplateOpen}
        onClose={() => {
          if (templatesBusy) return;
          closeCreateTemplateDialog();
        }}
        title={createTemplateTitle}
        onTitleChange={setCreateTemplateTitle}
        scope={createTemplateScope}
        onScopeChange={setCreateTemplateScope}
        templateType={createTemplateType}
        onTemplateTypeChange={setCreateTemplateType}
        canCreateOrgTemplate={!!workspaceActiveOrgId && !!canCreateOrgTemplates}
        canCreateOrgFolder={!!workspaceActiveOrgId && !!canCreateOrgFolders}
        folders={createTemplateFolders}
        folderId={createTemplateFolderId}
        onFolderChange={setCreateTemplateFolderId}
        onCreateFolder={async () => {
          if (typeof window === "undefined") return;
          const raw = window.prompt("Название папки", "");
          const name = String(raw || "").trim();
          if (!name) return;
          await Promise.resolve(createTemplateFolderFromModal?.(name));
        }}
        selectionCount={selectedBpmnElementIds.length}
        hybridSelectionCount={selectedHybridTemplateCount}
        busy={templatesBusy}
        onSave={saveCurrentSelectionAsTemplate}
      />

      <Modal
        open={versionsOpen}
        title="История версий BPMN"
        onClose={closeVersionsDialog}
        cardClassName="w-[min(1440px,92vw)] max-w-[1440px] h-[min(860px,88vh)]"
        bodyClassName="flex min-h-0 flex-1 flex-col !overflow-hidden !max-h-none"
        footer={(
          <BpmnVersionActions
            onRefresh={() => void refreshSnapshotVersions()}
            onClose={closeVersionsDialog}
            busy={versionsBusy}
          />
        )}
        footerClassName="!border-t-0 !p-0"
      >
        <div
          className={compareActive
            ? "grid h-full min-h-0 gap-3 overflow-hidden [grid-template-rows:minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)] lg:[grid-template-rows:auto_minmax(0,1fr)]"
            : "grid h-full min-h-0 gap-3 overflow-hidden [grid-template-rows:minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)]"}
          data-testid="bpmn-versions-modal"
        >
          <div className={compareActive ? "flex min-h-0 flex-col md:row-span-2" : "flex min-h-0 flex-col"}>
            <BpmnVersionList
              items={versionsList}
              previewId={previewSnapshotId}
              compareAId={versionSelection?.compareAId || ""}
              compareBId={versionSelection?.compareBId || ""}
              busy={versionsBusy}
              loadingMore={versionsLoadingMore}
              hasMore={versionsHasMore}
              loadState={versionsLoadState}
              loadError={versionsLoadError}
              emptyMessage={revisionEmptyState.message}
              totalCount={versionsTotalCount}
              includeTechnical={versionsIncludeTechnical}
              isAdmin={isAdmin}
              onPreview={onVersionPreview}
              onAssign={onVersionAssign}
              onLoadMore={() => void loadMoreSnapshotVersions?.()}
              onRefresh={() => void refreshSnapshotVersions?.()}
              onToggleTechnical={() => void toggleVersionsIncludeTechnical?.()}
              getDiffSummary={getVersionDiffSummary}
            />
          </div>

          {compareActive ? (
            <>
              <div className="min-h-0 lg:col-start-2 lg:col-end-4">
                <BpmnVersionCompareHeader
                  counts={versionCompareCounts}
                  mode={versionCompareMode}
                  onModeChange={onVersionCompareModeChange}
                  showPositional={versionCompareShowPositional}
                  onTogglePositional={onVersionCompareTogglePositional}
                  diffBusy={versionCompareBusy}
                  noChanges={versionCompareNoChanges}
                />
              </div>
              <div className="min-h-0 h-full overflow-hidden">
                <BpmnVersionComparePane {...versionPaneA} />
              </div>
              <div className="min-h-0 h-full overflow-hidden">
                <BpmnVersionComparePane {...versionPaneB} />
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-col gap-2">
              {versionPaneSingle ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <BpmnVersionComparePane {...versionPaneSingle} />
                </div>
              ) : (
                <div
                  className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-panel2/35 px-4 text-center text-sm text-muted"
                  data-testid="bpmn-versions-pane-idle"
                >
                  Выберите версию слева
                </div>
              )}
              {showSecondVersionHint ? (
                <div
                  className="rounded-lg border border-border bg-panel px-3 py-2 text-xs text-muted"
                  data-testid="bpmn-versions-hint-second"
                >
                  Выберите вторую версию для сравнения (метка B на карточке)
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
