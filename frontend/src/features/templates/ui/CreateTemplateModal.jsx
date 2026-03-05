import Modal from "../../../shared/ui/Modal";

function toText(value) {
  return String(value || "").trim();
}

function flattenFolders(folders = [], parentId = "", level = 0) {
  const rows = (Array.isArray(folders) ? folders : [])
    .filter((row) => toText(row?.parent_id) === toText(parentId))
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0) || toText(a?.name).localeCompare(toText(b?.name), "ru"));
  const out = [];
  rows.forEach((row) => {
    out.push({ ...row, _level: level });
    out.push(...flattenFolders(folders, row.id, level + 1));
  });
  return out;
}

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
  canCreateOrgFolder = false,
  folders = [],
  folderId = "",
  onFolderChange,
  onCreateFolder,
  selectionCount = 0,
  hybridSelectionCount = 0,
  busy = false,
  onSave,
}) {
  const visibleFolders = flattenFolders(folders);
  const canCreateFolder = scope !== "org" || canCreateOrgFolder;
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
        <div className="space-y-2 rounded-lg border border-border bg-panel2/25 px-3 py-2">
          <div className="text-xs text-muted">Scope</div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="radio"
              name="template_scope"
              checked={scope !== "org"}
              onChange={() => onScopeChange?.("personal")}
              disabled={busy}
              data-testid="create-template-scope-personal"
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
              data-testid="create-template-scope-org"
            />
            <span>Общий для организации</span>
            {!canCreateOrgTemplate ? <span className="text-xs text-muted">(Only org admins can create shared templates)</span> : null}
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-panel2/25 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted">Folder</div>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => void onCreateFolder?.()}
              disabled={busy || !canCreateFolder}
              title={canCreateFolder ? "Создать папку" : "Only org admins can create shared folders"}
              data-testid="create-template-folder-create"
            >
              New folder
            </button>
          </div>
          <select
            className="input mt-1 w-full"
            value={toText(folderId)}
            onChange={(event) => onFolderChange?.(String(event.target.value || ""))}
            data-testid="create-template-folder-select"
            disabled={busy}
          >
            <option value="">Без папки</option>
            {visibleFolders.map((folder) => {
              const id = toText(folder?.id);
              if (!id) return null;
              const level = Number(folder?._level || 0);
              const indent = level > 0 ? `${"· ".repeat(level)}` : "";
              const label = `${indent}${toText(folder?.name)}`;
              return (
                <option key={id} value={id}>{label}</option>
              );
            })}
          </select>
        </div>
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
                onChange={() => onTemplateTypeChange?.("bpmn_fragment_v1")}
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
      </div>
    </Modal>
  );
}
