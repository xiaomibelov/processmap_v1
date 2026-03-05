import Modal from "../../../shared/ui/Modal";
import TemplateItemRow from "./TemplateItemRow";

export default function TemplatesPicker({
  open,
  onClose,
  activeScope = "personal",
  onScopeChange,
  search = "",
  onSearchChange,
  personalCount = 0,
  orgCount = 0,
  showOrgScope = true,
  templates = [],
  busy = false,
  onRefresh,
  onApply,
  onDelete,
}) {
  return (
    <Modal
      open={open}
      title="Шаблоны"
      onClose={onClose}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <button type="button" className="secondaryBtn" onClick={() => void onRefresh?.()} disabled={busy}>Обновить</button>
          <button type="button" className="secondaryBtn" onClick={onClose} disabled={busy}>Закрыть</button>
        </div>
      )}
    >
      <div className="space-y-3" data-testid="templates-picker">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`secondaryBtn h-8 px-3 text-xs ${activeScope === "personal" ? "border-accent/55 bg-accentSoft/25 text-fg" : ""}`}
            onClick={() => onScopeChange?.("personal")}
          >
            Личные ({Number(personalCount || 0)})
          </button>
          {showOrgScope ? (
            <button
              type="button"
              className={`secondaryBtn h-8 px-3 text-xs ${activeScope === "org" ? "border-accent/55 bg-accentSoft/25 text-fg" : ""}`}
              onClick={() => onScopeChange?.("org")}
            >
              Организация ({Number(orgCount || 0)})
            </button>
          ) : (
            <span className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted">
              Организация (0)
            </span>
          )}
          <input
            type="search"
            className="input h-8 min-h-0 flex-1 px-3 py-0 text-xs"
            placeholder="Поиск шаблонов"
            value={search}
            onChange={(event) => onSearchChange?.(String(event.target.value || ""))}
          />
        </div>
        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">
            Шаблонов пока нет.
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <TemplateItemRow
                key={String(template?.id || "")}
                template={template}
                onApply={onApply}
                onDelete={onDelete}
                deleting={busy}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
