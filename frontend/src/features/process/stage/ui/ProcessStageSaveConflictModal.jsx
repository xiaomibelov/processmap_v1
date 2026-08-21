import Modal from "../../../../shared/ui/Modal";

function toText(value) {
  return String(value || "").trim();
}

export default function ProcessStageSaveConflictModal({
  open = false,
  busy = false,
  view = null,
  onRefreshSession = null,
  onOverwrite = null,
  onStay = null,
  onReport = null,
  reportSent = false,
}) {
  const resolvedView = view && typeof view === "object" ? view : {};
  const contextLines = Array.isArray(resolvedView.contextLines) ? resolvedView.contextLines : [];
  const actions = resolvedView.actions && typeof resolvedView.actions === "object" ? resolvedView.actions : {};
  const title = toText(resolvedView.title) || "Конфликт версии сессии";
  const lead = toText(resolvedView.lead);
  const actorMode = toText(resolvedView.actorMode) || "unknown";
  const refreshLabel = toText(actions.refreshLabel) || "Загрузить версию с сервера";
  const overwriteLabel = toText(actions.overwriteLabel) || "Оставить мою версию";
  const reportLabel = reportSent === true
    ? "Отчёт отправлен"
    : (toText(actions.reportLabel) || "Сообщить об ошибке");
  return (
    <Modal
      open={open === true}
      title={title}
      onClose={onStay}
      cardClassName="max-w-[720px]"
      bodyClassName="space-y-3"
      footerClassName="flex flex-wrap gap-2"
      footer={(
        <>
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-xs"
            onClick={onRefreshSession}
            disabled={busy === true}
            data-testid="diagram-save-conflict-modal-refresh"
            title={toText(actions.refreshHint)}
          >
            {refreshLabel}
          </button>
          {typeof onOverwrite === "function" ? (
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-xs"
              onClick={onOverwrite}
              disabled={busy === true}
              data-testid="diagram-save-conflict-modal-overwrite"
              title={toText(actions.overwriteHint)}
            >
              {overwriteLabel}
            </button>
          ) : null}
          {typeof onReport === "function" ? (
            <button
              type="button"
              className="ghostBtn h-9 px-3 text-xs"
              onClick={onReport}
              disabled={busy === true || reportSent === true}
              data-testid="diagram-save-conflict-modal-report"
              title={toText(actions.reportHint)}
            >
              {reportLabel}
            </button>
          ) : null}
        </>
      )}
    >
      <div data-testid="diagram-save-conflict-modal" data-actor-mode={actorMode}>
        {lead ? (
          <p className="text-sm text-fg" data-testid="diagram-save-conflict-modal-lead">
            {lead}
          </p>
        ) : null}
        {contextLines.length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted" data-testid="diagram-save-conflict-modal-context">
            {contextLines.map((line, index) => (
              <li key={`conflict_line_${index + 1}`}>{line}</li>
            ))}
          </ul>
        ) : null}
        <div className="text-[11px] text-muted">
          {refreshLabel}: {toText(actions.refreshHint)}
        </div>
        {typeof onOverwrite === "function" ? (
          <div className="text-[11px] text-muted">
            {overwriteLabel}: {toText(actions.overwriteHint)}
          </div>
        ) : null}
        <div className="text-[11px] text-muted">
          Отложить решение можно, закрыв окно — сохранения останутся на паузе до выбора.
        </div>
      </div>
    </Modal>
  );
}
