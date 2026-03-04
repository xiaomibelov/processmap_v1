import Modal from "../../../shared/ui/Modal";

export default function CreateTemplateModal({
  open,
  onClose,
  title = "",
  onTitleChange,
  scope = "personal",
  onScopeChange,
  canCreateOrgTemplate = false,
  selectionCount = 0,
  busy = false,
  onSave,
}) {
  return (
    <Modal
      open={open}
      title="Сохранить шаблон"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="secondaryBtn" onClick={onClose} disabled={busy}>Отмена</button>
          <button
            type="button"
            className="primaryBtn"
            onClick={() => void onSave?.()}
            disabled={busy || !String(title || "").trim()}
            data-testid="template-pack-save-confirm"
          >
            {busy ? "Сохранение..." : "Сохранить шаблон"}
          </button>
        </>
      )}
    >
      <div className="space-y-3" data-testid="template-pack-save-modal">
        <label className="fieldLabel">
          <span>Название</span>
          <input
            type="text"
            className="input mt-1 w-full"
            value={title}
            onChange={(event) => onTitleChange?.(String(event.target.value || ""))}
            placeholder="Название шаблона"
            data-testid="template-pack-title-input"
          />
        </label>
        <div className="rounded-lg border border-border bg-panel2/35 px-3 py-2 text-xs text-muted">
          Выделено BPMN элементов: <b className="text-fg">{Number(selectionCount || 0)}</b>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="radio"
            name="template_scope"
            checked={scope !== "org"}
            onChange={() => onScopeChange?.("personal")}
            disabled={busy}
          />
          <span>Личный</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="radio"
            name="template_scope"
            checked={scope === "org"}
            onChange={() => onScopeChange?.("org")}
            disabled={busy || !canCreateOrgTemplate}
          />
          <span>Общий для организации</span>
          {!canCreateOrgTemplate ? <span className="text-xs text-muted">(Недоступно по правам)</span> : null}
        </label>
      </div>
    </Modal>
  );
}
