function toText(value) {
  return String(value || "").trim();
}

function scopeLabel(scopeRaw) {
  return toText(scopeRaw).toLowerCase() === "org" ? "организация" : "личный";
}

export default function TemplateItemRow({
  template,
  onApply,
  onDelete,
  deleting = false,
}) {
  const item = template && typeof template === "object" ? template : {};
  const templateId = toText(item.id) || "unknown";
  const count = Number(item.selection_count || item.bpmn_element_ids?.length || 0);
  const updatedAt = Number(item.updated_at || item.created_at || 0);
  return (
    <div
      className="rounded-lg border border-border/70 bg-panel2/35 px-3 py-2"
      data-testid={`template-item-${templateId}`}
      data-pack-id={templateId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg">{toText(item.title || "Шаблон")}</div>
          <div className="text-[11px] text-muted">
            тип: {scopeLabel(item.scope)} · выбрано: {count || 0}
            {updatedAt > 0 ? ` · ${new Date(updatedAt).toLocaleString("ru-RU")}` : ""}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            ids: {Array.isArray(item.bpmn_element_ids) && item.bpmn_element_ids.length ? item.bpmn_element_ids.join(", ") : "—"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px]"
            onClick={() => void onApply?.(item)}
            data-testid={`btn-apply-template-${templateId}`}
          >
            Применить
          </button>
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px] text-danger"
            onClick={() => void onDelete?.(item)}
            disabled={deleting}
            data-testid="template-pack-delete"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
