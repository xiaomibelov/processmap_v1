import Modal from "../../../shared/ui/Modal";

export default function CreateTemplateModal({
  open,
  onClose,
  title = "",
  onTitleChange,
  scope = "personal",
  onScopeChange,
  templateType = "bpmn_selection_v1",
  onTemplateTypeChange,
  canCreateOrgTemplate = false,
  selectionCount = 0,
  hybridSelectionCount = 0,
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
            disabled={
              busy
              || !String(title || "").trim()
              || (templateType === "hybrid_stencil_v1" && Number(hybridSelectionCount || 0) <= 0)
              || (templateType !== "hybrid_stencil_v1" && Number(selectionCount || 0) <= 0)
            }
            data-testid="btn-save-template"
          >
            {busy ? "Сохранение..." : "Сохранить шаблон"}
          </button>
        </>
      )}
    >
      <div className="space-y-3" data-testid="modal-create-template">
        <label className="fieldLabel">
          <span>Название</span>
          <input
            type="text"
            className="input mt-1 w-full"
            value={title}
            onChange={(event) => onTitleChange?.(String(event.target.value || ""))}
            placeholder="Название шаблона"
            data-testid="input-template-name"
          />
        </label>
        <div className="rounded-lg border border-border bg-panel2/35 px-3 py-2 text-xs text-muted">
          Выделено BPMN элементов: <b className="text-fg">{Number(selectionCount || 0)}</b>
          <span> · Hybrid элементов: <b className="text-fg">{Number(hybridSelectionCount || 0)}</b></span>
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-panel2/25 px-3 py-2">
          <div className="text-xs text-muted">Тип шаблона</div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="radio"
              name="template_type"
              checked={templateType !== "hybrid_stencil_v1"}
              onChange={() => onTemplateTypeChange?.("bpmn_selection_v1")}
              disabled={busy}
            />
            <span>BPMN selection</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="radio"
              name="template_type"
              checked={templateType === "hybrid_stencil_v1"}
              onChange={() => onTemplateTypeChange?.("hybrid_stencil_v1")}
              disabled={busy || Number(hybridSelectionCount || 0) <= 0}
              title={Number(hybridSelectionCount || 0) > 0 ? "" : "Выделите Hybrid элементы для stencil"}
            />
            <span>Hybrid stencil (placement)</span>
          </label>
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
            title={canCreateOrgTemplate ? "" : "Only org admins can create shared templates"}
          />
          <span>Общий для организации</span>
          {!canCreateOrgTemplate ? <span className="text-xs text-muted">(Only org admins can create shared templates)</span> : null}
        </label>
      </div>
    </Modal>
  );
}
