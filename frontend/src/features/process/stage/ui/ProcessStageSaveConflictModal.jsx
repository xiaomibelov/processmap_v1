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
  onDiscardLocalChanges = null,
  onCompare = null,
}) {
  const resolvedView = view && typeof view === "object" ? view : {};
  const contextLines = Array.isArray(resolvedView.contextLines) ? resolvedView.contextLines : [];
  const actions = resolvedView.actions && typeof resolvedView.actions === "object" ? resolvedView.actions : {};
  const title = toText(resolvedView.title) || "Конфликт версии сессии";
  const lead = toText(resolvedView.lead);
  const actorMode = toText(resolvedView.actorMode) || "unknown";
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
            {toText(actions.refreshLabel) || "Обновить и продолжить"}
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
              {toText(actions.overwriteLabel) || "Перезаписать мои изменения"}
            </button>
          ) : null}
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onStay}
            disabled={busy === true}
            data-testid="diagram-save-conflict-modal-stay"
            title={toText(actions.stayHint)}
          >
            {toText(actions.stayLabel) || "Отмена"}
          </button>
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs"
            onClick={onDiscardLocalChanges}
            disabled={busy === true}
            data-testid="diagram-save-conflict-modal-discard"
            title={toText(actions.discardHint)}
          >
            {toText(actions.discardLabel) || "Отбросить локальные изменения"}
          </button>
          {typeof onCompare === "function" ? (
            <button
              type="button"
              className="secondaryBtn h-9 px-3 text-xs"
              onClick={onCompare}
              disabled={busy === true}
              data-testid="diagram-save-conflict-modal-compare"
              title={toText(actions.compareHint)}
            >
              {toText(actions.compareLabel) || "Сравнить и выбрать"}
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
          {toText(actions.refreshLabel) || "Обновить и продолжить"}: {toText(actions.refreshHint)}
        </div>
        {typeof onOverwrite === "function" ? (
          <div className="text-[11px] text-muted">
            {toText(actions.overwriteLabel) || "Перезаписать мои изменения"}: {toText(actions.overwriteHint)}
          </div>
        ) : null}
        <div className="text-[11px] text-muted">
          {toText(actions.stayLabel) || "Отмена"}: {toText(actions.stayHint)}
        </div>
        <div className="text-[11px] text-muted">
          {toText(actions.discardLabel) || "Отбросить локальные изменения"}: {toText(actions.discardHint)}
        </div>
      </div>
    </Modal>
  );
}
