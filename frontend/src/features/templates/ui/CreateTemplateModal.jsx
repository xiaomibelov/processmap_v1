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

function ScopeButton({ active = false, label = "", description = "", onClick, disabled = false, testId = "" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex min-h-[48px] w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      } ${
        active
          ? "border-accent/60 bg-accentSoft/25 text-fg"
          : "border-border/70 bg-panel2/40 text-fg hover:border-accent/35 hover:bg-panel2/70"
      }`}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted">{description}</span>
    </button>
  );
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
  const activeType = toText(templateType).toLowerCase();

  const typeLabel = activeType === "hybrid_stencil_v1" ? "Hybrid stencil" : "BPMN fragment";
  const bpmnCount = Number(selectionCount || 0);
  const hybridCount = Number(hybridSelectionCount || 0);

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
              || (activeType === "hybrid_stencil_v1" && hybridCount <= 0)
              || (activeType !== "hybrid_stencil_v1" && bpmnCount <= 0)
            }
            data-testid="btn-save-template"
          >
            {busy ? "Сохранение..." : "Сохранить шаблон"}
          </button>
        </>
      )}
    >
      <div className="space-y-4 min-w-[420px]" data-testid="modal-create-template">
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

        <div className="space-y-2 rounded-xl border border-border bg-panel2/25 px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Scope</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ScopeButton
              active={scope !== "org"}
              label="Личный"
              description="Доступен только вам"
              onClick={() => onScopeChange?.("personal")}
              testId="create-template-scope-personal"
            />
            <ScopeButton
              active={scope === "org"}
              label="Общий для организации"
              description={canCreateOrgTemplate ? "Доступен всей организации" : "Only org admins can create shared templates"}
              onClick={() => onScopeChange?.("org")}
              disabled={!canCreateOrgTemplate}
              testId="create-template-scope-org"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-panel2/25 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Folder</div>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-panel2/25 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Тип шаблона</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded border border-accent/40 bg-accentSoft/20 px-2 py-0.5 text-xs text-accent">{typeLabel}</span>
            </div>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="radio"
                  name="template_type"
                  checked={activeType !== "hybrid_stencil_v1"}
                  onChange={() => onTemplateTypeChange?.("bpmn_fragment_v1")}
                  disabled={busy}
                />
                <span>BPMN fragment</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="radio"
                  name="template_type"
                  checked={activeType === "hybrid_stencil_v1"}
                  onChange={() => onTemplateTypeChange?.("hybrid_stencil_v1")}
                  disabled={busy || hybridCount <= 0}
                  title={hybridCount > 0 ? "" : "Выделите Hybrid элементы для stencil"}
                />
                <span>Hybrid stencil (placement)</span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-panel2/35 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Выделение</div>
            <div className="mt-2 space-y-1 text-sm text-muted">
              <div className="flex items-center justify-between gap-2">
                <span>BPMN элементов</span>
                <b className="text-fg">{bpmnCount}</b>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Hybrid элементов</span>
                <b className="text-fg">{hybridCount}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
