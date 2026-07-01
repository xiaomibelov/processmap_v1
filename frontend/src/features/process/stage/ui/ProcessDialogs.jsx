import Modal from "../../../../shared/ui/Modal";
import CreateTemplateModal from "../../../templates/ui/CreateTemplateModal";
import { resolveRevisionHistoryEmptyState } from "./revisionHistoryUiModel";
import BpmnVersionList from "./BpmnVersionList";
import BpmnVersionPreview from "./BpmnVersionPreview";
import BpmnVersionActions from "./BpmnVersionActions";
import BpmnVersionDiffOverlay from "./BpmnVersionDiffOverlay";

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
    hasSession,
    versionsList,
    versionsLoadState,
    versionsLoadError,
    versionsUserFacingCount,
    versionsServerEntriesCount,
    versionsTechnicalEntriesCount,
    setGenErr,
    setDiffTargetSnapshotId,
    setDiffBaseSnapshotId,
    openDiffDialog,
    clearSnapshotHistory,
    previewSnapshotId,
    setPreviewSnapshotId,
    previewSnapshotVersion,
    formatSnapshotTs,
    snapshotLabel,
    downloadSnapshot,
    editSnapshotLabel,
    togglePinSnapshot,
    openDiffForSnapshot,
    restoreSnapshot,
    previewSnapshot,
    diffOpen,
    closeDiffDialog,
    diffBaseSnapshotId,
    setDiffBaseSnapshotId: setDiffBaseId,
    diffTargetSnapshotId,
    setDiffTargetSnapshotId: setDiffTargetId,
    currentBpmnVersionId,
    diffBaseSnapshot,
    diffTargetSnapshot,
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
        footer={(
          <BpmnVersionActions
            selected={previewSnapshot}
            onDownload={() => previewSnapshot && downloadSnapshot(previewSnapshot)}
            onRestore={() => previewSnapshot && restoreSnapshot(previewSnapshot)}
            onDiffWithCurrent={() => previewSnapshot && openDiffForSnapshot(previewSnapshot)}
            onDiffAB={() => {
              const list = asArray(versionsList);
              const latestId = String(list[0]?.id || "");
              const prevId = String(list[1]?.id || "");
              if (!latestId || !prevId) {
                setGenErr("Для сравнения нужно минимум две версии.");
                return;
              }
              setDiffTargetSnapshotId(latestId);
              setDiffBaseSnapshotId(prevId);
              openDiffDialog();
            }}
            onRefresh={() => void refreshSnapshotVersions()}
            onClose={closeVersionsDialog}
            busy={versionsBusy}
            isCurrent={String(previewSnapshot?.id || "") === String(currentBpmnVersionId || "")}
          />
        )}
        footerClassName="!border-t-0 !p-0"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]" data-testid="bpmn-versions-modal">
          <BpmnVersionList
            versions={versionsList}
            selectedId={previewSnapshotId}
            currentVersionId={currentBpmnVersionId}
            busy={versionsBusy}
            loadState={versionsLoadState}
            loadError={versionsLoadError}
            emptyMessage={revisionEmptyState.message}
            onSelect={previewSnapshotVersion}
            onDownload={downloadSnapshot}
            onRestore={restoreSnapshot}
            onDiffWithCurrent={openDiffForSnapshot}
            onDiffAB={() => {
              const list = asArray(versionsList);
              const latestId = String(list[0]?.id || "");
              const prevId = String(list[1]?.id || "");
              if (!latestId || !prevId) {
                setGenErr("Для сравнения нужно минимум две версии.");
                return;
              }
              setDiffTargetSnapshotId(latestId);
              setDiffBaseSnapshotId(prevId);
              openDiffDialog();
            }}
          />
          <BpmnVersionPreview
            xml={previewSnapshot?.xml}
            label={previewSnapshot ? snapshotLabel(previewSnapshot) : ""}
            size={previewSnapshot?.len}
            onDownload={() => previewSnapshot && downloadSnapshot(previewSnapshot)}
            downloadLabel="Скачать .bpmn"
          />
        </div>
      </Modal>

      <Modal
        open={diffOpen}
        title="Семантический diff BPMN"
        onClose={closeDiffDialog}
        footer={(
          <>
            <button type="button" className="secondaryBtn" onClick={closeDiffDialog}>
              Закрыть
            </button>
          </>
        )}
      >
        <div className="space-y-3" data-testid="bpmn-versions-diff-modal">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-1 text-xs text-muted">
              <span>Версия A (база)</span>
              <select
                className="select w-full"
                value={String(diffBaseSnapshotId || "")}
                onChange={(e) => setDiffBaseId(String(e.target.value || ""))}
                data-testid="bpmn-diff-base-select"
              >
                <option value="">Выберите версию</option>
                {asArray(versionsList).map((item) => {
                  const id = String(item?.id || "");
                  return (
                    <option key={`base_${id}`} value={id}>
                      {snapshotLabel(item)} · {formatSnapshotTs(item?.ts)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-muted">
              <span>Версия B (цель)</span>
              <select
                className="select w-full"
                value={String(diffTargetSnapshotId || "")}
                onChange={(e) => setDiffTargetId(String(e.target.value || ""))}
                data-testid="bpmn-diff-target-select"
              >
                <option value="">Выберите версию</option>
                {asArray(versionsList).map((item) => {
                  const id = String(item?.id || "");
                  return (
                    <option key={`target_${id}`} value={id}>
                      {snapshotLabel(item)} · {formatSnapshotTs(item?.ts)}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {diffBaseSnapshot && diffTargetSnapshot ? (
            <BpmnVersionDiffOverlay
              previousXml={String(diffBaseSnapshot.xml || "")}
              nextXml={String(diffTargetSnapshot.xml || "")}
              previousLabel={`${snapshotLabel(diffBaseSnapshot)} · ${formatSnapshotTs(diffBaseSnapshot?.ts)}`}
              nextLabel={`${snapshotLabel(diffTargetSnapshot)} · ${formatSnapshotTs(diffTargetSnapshot?.ts)}`}
              onClose={closeDiffDialog}
            />
          ) : (
            <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">
              Выберите две версии для сравнения.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
