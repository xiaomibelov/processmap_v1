import { useState } from "react";
import Modal from "../../../../shared/ui/Modal";
import CreateTemplateModal from "../../../templates/ui/CreateTemplateModal";
import { resolveRevisionHistoryEmptyState } from "./revisionHistoryUiModel";
import BpmnVersionActions from "./BpmnVersionActions";
import BpmnVersionDiffOverlay from "./BpmnVersionDiffOverlay";

export default function ProcessDialogs({ view = {} }) {
  const [showPreviewXml, setShowPreviewXml] = useState(false);
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
    versionsTotalCount,
    versionsHasMore,
    versionsLoadingMore,
    versionsIncludeTechnical,
    loadMoreSnapshotVersions,
    toggleVersionsIncludeTechnical,
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
    shortSnapshotHash,
    downloadSnapshot,
    editSnapshotLabel,
    togglePinSnapshot,
    openDiffForSnapshot,
    compareVersionWithCurrent,
    restoreSnapshot,
    canRestoreVersion,
    previewSnapshot,
    diffOpen,
    historyDiffOpen,
    historyDiffLocalXml,
    historyDiffVersionXml,
    historyDiffVersionLabel,
    closeHistoryDiff,
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
        cardClassName="w-[calc(100vw-32px)] max-w-[1200px] min-w-[900px]"
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
            onToggleXml={() => setShowPreviewXml((prev) => !prev)}
            busy={versionsBusy}
            isCurrent={String(previewSnapshot?.id || "") === String(currentBpmnVersionId || "")}
            hasEnoughForDiff={asArray(versionsList).length >= 2}
          />
        )}
        footerClassName="!border-t-0 !p-0"
      >
        <div className="grid h-[65vh] min-h-[480px] gap-3 overflow-hidden md:grid-cols-[280px_1fr] lg:grid-cols-[minmax(260px,30%)_minmax(0,70%)]" data-testid="bpmn-versions-modal">
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 px-1 text-xs text-muted" data-testid="bpmn-versions-count">
              <div className="flex items-center justify-between gap-2">
                <span data-testid="bpmn-versions-shown-count">
                  Показано {asArray(versionsList).length} из {Math.max(versionsTotalCount || 0, asArray(versionsList).length)} версий
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    checked={!!versionsIncludeTechnical}
                    onChange={() => void toggleVersionsIncludeTechnical?.()}
                    disabled={versionsBusy || versionsLoadingMore}
                    data-testid="bpmn-versions-show-technical"
                  />
                  Показать технические
                </label>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-muted">
                Текущий BPMN сохраняется отдельно от опубликованных версий. Пустая история не означает, что черновик не сохранён.
                Новая версия BPMN создаётся, когда изменилось состояние сессии. Чтобы понять, кто и что изменил, используйте compare-first.
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {versionsLoadState === "loading" ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-loading">
                  Загружаем историю версий...
                </div>
              ) : versionsLoadState === "failed" ? (
                <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="bpmn-versions-error">
                  Не удалось загрузить историю версий: {String(versionsLoadError || "ошибка загрузки")}
                </div>
              ) : versionsLoadState === "empty" || (versionsLoadState === "ready" && versionsList.length === 0) ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-empty">
                  {String(revisionEmptyState.message || "Версий пока нет. Текущий BPMN может быть сохранён как черновик; новая версия создаётся отдельным действием.")}
                </div>
              ) : versionsList.length === 0 ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-idle">
                  История версий ещё не загружена.
                </div>
              ) : (
                <>
                {versionsList.map((item) => {
                  const id = String(item?.id || "");
                  const active = id === String(previewSnapshotId || "");
                  const isLatest = id === String(asArray(versionsList)[0]?.id || "");
                  return (
                    <div
                      key={id}
                      className={"rounded-lg border px-3 py-2 transition-colors " + (active ? "border-accent bg-accentSoft/35" : "border-border bg-panel hover:border-accent hover:bg-accentSoft/15")}
                      data-testid="bpmn-version-item"
                      data-snapshot-id={id}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>{formatSnapshotTs(item?.ts)}</span>
                        <span>{String(item?.reasonLabel || item?.reason || "Импорт BPMN")}</span>
                      </div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-fg" data-testid="bpmn-version-label">
                          {snapshotLabel(item)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isLatest ? (
                            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                              последняя
                            </span>
                          ) : null}
                          <span className="rounded-full border border-accent/40 bg-accentSoft/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                            {Number(item?.revisionNumber || item?.rev || 0) > 0
                              ? `версия ${Number(item?.revisionNumber || item?.rev || 0)}`
                              : "без номера версии"}
                          </span>
                        </div>
                      </div>
                      <div className="mb-1 text-xs text-muted">
                        кто изменил: {String(item?.authorLabel || item?.authorName || item?.authorEmail || item?.authorId || "Автор не указан")}
                      </div>
                      <div className="mb-1 text-xs text-muted">
                        комментарий: {String(item?.comment || "—")}
                      </div>
                      <div className="mb-1 text-xs text-muted">
                        что изменилось: откройте «Сравнить» для diff с соседней версией.
                      </div>
                      <div className="mb-1 text-xs text-muted">
                        хэш: <span className="font-mono text-fg">{shortSnapshotHash(item?.hash || item?.xml || "")}</span> · размер: {Number(item?.len || String(item?.xml || "").length)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void (previewSnapshotVersion ? previewSnapshotVersion(item) : setPreviewSnapshotId(id))}
                          data-testid="bpmn-version-preview"
                        >
                          Предпросмотр XML
                        </button>
                        <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => void downloadSnapshot(item)}>
                          Скачать .bpmn
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void openDiffForSnapshot(item)}
                          disabled={versionsBusy || versionsList.length < 2}
                          data-testid="bpmn-version-diff"
                        >
                          Сравнить
                        </button>
                        <button
                          type="button"
                          className="primaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void restoreSnapshot(item)}
                          disabled={versionsBusy}
                          data-testid="bpmn-version-restore"
                        >
                          Восстановить
                        </button>
                      </div>
                    </div>
                  );
                })}
                {versionsLoadState === "ready" && versionsList.length > 0 ? (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    {versionsHasMore ? (
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-3 text-xs"
                        onClick={() => void loadMoreSnapshotVersions?.()}
                        disabled={versionsBusy || versionsLoadingMore}
                        data-testid="bpmn-versions-load-more"
                      >
                        {versionsLoadingMore ? "Загрузка..." : "Загрузить ещё 10"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted">Все версии загружены</span>
                    )}
                  </div>
                ) : null}
                {versionsLoadState === "failed" ? (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      className="secondaryBtn h-8 px-3 text-xs"
                      onClick={() => void refreshSnapshotVersions?.()}
                      disabled={versionsBusy || versionsLoadingMore}
                      data-testid="bpmn-versions-retry"
                    >
                      Обновить список версий
                    </button>
                  </div>
                ) : null}
                </>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-panel2/35">
            <div className="border-b border-border px-3 py-2 text-xs text-muted">
              {previewSnapshot ? `XML предпросмотр · ${formatSnapshotTs(previewSnapshot.ts)}` : "Выберите версию слева"}
            </div>
            <div className="min-h-0 flex-1 p-3">
              {previewSnapshot && !String(previewSnapshot?.xml || "").trim() ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-version-preview-lazy">
                  XML этой версии подгружается по требованию. Нажмите «Предпросмотр XML», если загрузка ещё не началась.
                </div>
              ) : (
                <textarea
                  className="xmlEditorTextarea h-full min-h-[44vh] w-full"
                  value={String(previewSnapshot?.xml || "")}
                  readOnly
                  data-testid="bpmn-version-preview-xml"
                />
              )}
            </div>
          </div>

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

      <Modal
        open={historyDiffOpen}
        title="Сравнение с текущей диаграммой"
        onClose={closeHistoryDiff}
        footer={(
          <button type="button" className="secondaryBtn" onClick={closeHistoryDiff}>
            Закрыть
          </button>
        )}
      >
        <div className="space-y-3" data-testid="bpmn-history-diff-modal">
          {historyDiffVersionXml && historyDiffLocalXml ? (
            <BpmnVersionDiffOverlay
              previousXml={String(historyDiffVersionXml || "")}
              nextXml={String(historyDiffLocalXml || "")}
              previousLabel={String(historyDiffVersionLabel || "Выбранная версия")}
              nextLabel="Текущая диаграмма"
              onClose={closeHistoryDiff}
            />
          ) : (
            <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">
              {historyDiffVersionXml ? "Загрузка текущей диаграммы..." : "Загрузка версии для сравнения..."}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
