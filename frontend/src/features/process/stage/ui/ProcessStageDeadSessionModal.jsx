import Modal from "../../../../shared/ui/Modal";

function toText(value) {
  return String(value || "").trim();
}

/**
 * P-1 D3: экран мёртвой сессии (терминальный 404, НЕ конфликт версий).
 * Конфликт-модал (409) — ProcessStageSaveConflictModal, отдельный контракт.
 */
export default function ProcessStageDeadSessionModal({
  open = false,
  view = null,
  onBackToList = null,
  onCreateNew = null,
  onOpenCurrent = null,
  onRestoreDraft = null,
  busy = false,
}) {
  const resolvedView = view && typeof view === "object" ? view : {};
  const contextLines = Array.isArray(resolvedView.contextLines) ? resolvedView.contextLines : [];
  const actions = resolvedView.actions && typeof resolvedView.actions === "object" ? resolvedView.actions : {};
  return (
    <Modal
      open={open === true}
      title={toText(resolvedView.title) || "Сессия удалена или недоступна"}
      onClose={onBackToList}
      cardClassName="max-w-[640px]"
      bodyClassName="space-y-3"
      footerClassName="flex flex-wrap gap-2"
      footer={(
        <>
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-xs"
            onClick={onBackToList}
            disabled={busy === true}
            data-testid="dead-session-back-to-list"
            title={toText(actions.backHint)}
          >
            {toText(actions.backLabel) || "К списку сессий"}
          </button>
          {typeof onCreateNew === "function" ? (
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-xs"
              onClick={onCreateNew}
              disabled={busy === true}
              data-testid="dead-session-create-new"
              title={toText(actions.createHint)}
            >
              {toText(actions.createLabel) || "Создать новую"}
            </button>
          ) : null}
          {typeof onOpenCurrent === "function" ? (
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-xs"
              onClick={onOpenCurrent}
              disabled={busy === true}
              data-testid="dead-session-open-current"
              title={toText(actions.openCurrentHint)}
            >
              {toText(actions.openCurrentLabel) || "Открыть актуальную"}
            </button>
          ) : null}
          {typeof onRestoreDraft === "function" ? (
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-xs"
              onClick={onRestoreDraft}
              disabled={busy === true}
              data-testid="dead-session-restore-draft"
              title={toText(actions.restoreHint)}
            >
              {toText(actions.restoreLabel) || "Восстановить черновик"}
            </button>
          ) : null}
        </>
      )}
    >
      <div data-testid="dead-session-modal">
        {toText(resolvedView.lead) ? (
          <p className="text-sm text-fg" data-testid="dead-session-lead">
            {toText(resolvedView.lead)}
          </p>
        ) : null}
        {contextLines.length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted" data-testid="dead-session-context">
            {contextLines.map((line, index) => (
              <li key={`dead_session_line_${index + 1}`}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
