import Modal from "../../../../shared/ui/Modal";
import CreateTemplateModal from "../../../templates/ui/CreateTemplateModal";
import { resolveRevisionHistoryEmptyState } from "./revisionHistoryUiModel";

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
    shortSnapshotHash,
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
    semanticDiffView,
  } = view;
  const revisionEmptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: versionsLoadState,
    meaningfulCountRaw: Array.isArray(versionsList) ? versionsList.length : 0,
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
        title="История ревизий BPMN"
        onClose={closeVersionsDialog}
        footer={(
          <>
            <button type="button" className="secondaryBtn" onClick={() => void refreshSnapshotVersions()} disabled={versionsBusy || !hasSession}>
              Обновить
            </button>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => {
                const latestId = String(asArray(versionsList)[0]?.id || "");
                const prevId = String(asArray(versionsList)[1]?.id || "");
                if (!latestId || !prevId) {
                  setGenErr("Для сравнения нужно минимум две версии.");
                  return;
                }
                setDiffTargetSnapshotId(latestId);
                setDiffBaseSnapshotId(prevId);
                openDiffDialog();
              }}
              disabled={versionsBusy || versionsList.length < 2}
              data-testid="bpmn-versions-open-diff"
            >
              Сравнить A/B
            </button>
            <button type="button" className="primaryBtn" onClick={closeVersionsDialog}>
              Закрыть
            </button>
          </>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]" data-testid="bpmn-versions-modal">
          <div className="rounded-xl border border-border bg-panel2/45 p-2">
            <div className="mb-2 px-1 text-xs text-muted" data-testid="bpmn-versions-count">
              Пользовательские ревизии: {versionsList.length}
              <span>
                {" "}
                · последняя: {Number(asArray(versionsList)[0]?.revisionNumber || 0) > 0
                  ? `Версия ${Number(asArray(versionsList)[0]?.revisionNumber || 0)}`
                  : "не опубликовано"}
              </span>
              {Number(versionsTechnicalEntriesCount || 0) > 0 ? (
                <span>
                  {" "}
                  · скрыто технических: {Number(versionsTechnicalEntriesCount || 0)}
                </span>
              ) : null}
              <div className="mt-1 text-[11px] text-muted">
                Текущий BPMN сохраняется отдельно от ревизий. Пустая история не означает, что черновик не сохранён.
                Новая ревизия появляется отдельным действием при значимом изменении схемы.
                Чтобы понять, кто и что изменил, используйте compare-first: «Сравнить A/B» или «Сравнить» у нужной ревизии.
              </div>
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
              {versionsLoadState === "loading" ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-loading">
                  Загружаем историю ревизий...
                </div>
              ) : versionsLoadState === "failed" ? (
                <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="bpmn-versions-error">
                  Не удалось загрузить историю ревизий: {String(versionsLoadError || "ошибка загрузки")}
                </div>
              ) : versionsLoadState === "empty" || (versionsLoadState === "ready" && versionsList.length === 0) ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-empty">
                  {String(revisionEmptyState.message || "Ревизий пока нет. Текущий BPMN может быть сохранён как черновик; ревизия создаётся отдельным действием.")}
                </div>
              ) : versionsList.length === 0 ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-versions-idle">
                  История ревизий ещё не загружена.
                </div>
              ) : (
                versionsList.map((item) => {
                  const id = String(item?.id || "");
                  const active = id === String(previewSnapshotId || "");
                  const isLatest = id === String(asArray(versionsList)[0]?.id || "");
                  return (
                    <div
                      key={id}
                      className={"rounded-lg border px-2.5 py-2 " + (active ? "border-accent bg-accentSoft/35" : "border-border bg-panel")}
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
                              : "без номера ревизии"}
                          </span>
                        </div>
                      </div>
                      <div className="mb-1 text-xs text-muted">
                        кто изменил: {String(item?.authorLabel || item?.authorName || item?.authorEmail || item?.authorId || "неизвестно")}
                      </div>
                      <div className="mb-2 text-xs text-muted">
                        комментарий: {String(item?.comment || "—")}
                      </div>
                      <div className="mb-2 text-xs text-muted">
                        что изменилось: откройте «Сравнить» для diff с соседней ревизией.
                      </div>
                      <div className="mb-2 text-xs text-muted">
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
                })
              )}
            </div>
          </div>
          <div className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-border bg-panel2/35">
            <div className="border-b border-border px-3 py-2 text-xs text-muted">
              {previewSnapshot ? `XML предпросмотр · ${formatSnapshotTs(previewSnapshot.ts)}` : "Выберите версию слева"}
            </div>
            <div className="min-h-0 flex-1 p-3">
              {previewSnapshot && !String(previewSnapshot?.xml || "").trim() ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted" data-testid="bpmn-version-preview-lazy">
                  XML этой ревизии подгружается по требованию. Нажмите «Предпросмотр XML», если загрузка ещё не началась.
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
              <span>Ревизия A (база)</span>
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
              <span>Ревизия B (цель)</span>
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

          {!semanticDiffView?.ok ? (
            <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">
              {String(semanticDiffView?.error || "Не удалось построить diff.")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border bg-panel">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-border text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Сущность</th>
                      <th className="px-3 py-2 text-right">Добавлено</th>
                      <th className="px-3 py-2 text-right">Удалено</th>
                      <th className="px-3 py-2 text-right">Изменено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "tasks", title: "Задачи" },
                      { key: "flows", title: "Переходы" },
                      { key: "lanes", title: "Лейны" },
                      { key: "subprocess", title: "Подпроцессы" },
                      { key: "conditions", title: "Условия" },
                    ].map((row) => (
                      <tr key={row.key} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 text-fg">{row.title}</td>
                        <td className="px-3 py-2 text-right text-fg" data-testid={`bpmn-diff-count-${row.key}-added`}>
                          {Number(semanticDiffView?.summary?.added?.[row.key] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right text-fg" data-testid={`bpmn-diff-count-${row.key}-removed`}>
                          {Number(semanticDiffView?.summary?.removed?.[row.key] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right text-fg" data-testid={`bpmn-diff-count-${row.key}-changed`}>
                          {Number(semanticDiffView?.summary?.changed?.[row.key] || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-panel px-3 py-2">
                  <div className="mb-1 text-xs font-semibold text-fg">Изменённые задачи</div>
                  <div className="space-y-1 text-xs text-muted">
                    {asArray(semanticDiffView?.details?.tasks?.changed).slice(0, 6).map((item) => (
                      <div key={`task_changed_${item.id}`}>
                        {String(item?.id || "")}: {String(item?.before?.name || "—")} → {String(item?.after?.name || "—")}
                      </div>
                    ))}
                    {asArray(semanticDiffView?.details?.tasks?.changed).length === 0 ? <div>Нет изменений</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-panel px-3 py-2">
                  <div className="mb-1 text-xs font-semibold text-fg">Изменённые условия</div>
                  <div className="space-y-1 text-xs text-muted">
                    {asArray(semanticDiffView?.details?.conditions?.changed).slice(0, 6).map((item) => (
                      <div key={`condition_changed_${item.key}`}>
                        {String(item?.from || "")} → {String(item?.to || "")}: {String(item?.before || "—")} → {String(item?.after || "—")}
                      </div>
                    ))}
                    {asArray(semanticDiffView?.details?.conditions?.changed).length === 0 ? <div>Нет изменений</div> : null}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
