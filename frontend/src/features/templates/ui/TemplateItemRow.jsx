function toText(value) {
  return String(value || "").trim();
}

function scopeLabel(scopeRaw) {
  return toText(scopeRaw).toLowerCase() === "org" ? "организация" : "личный";
}

function typeLabel(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (type === "hybrid_stencil_v1") return "hybrid stencil";
  if (type === "bpmn_fragment_v1") return "bpmn fragment";
  return "bpmn selection";
}

export default function TemplateItemRow({
  template,
  onApply,
  onDelete,
  deleting = false,
}) {
  const item = template && typeof template === "object" ? template : {};
  const templateId = toText(item.id) || "unknown";
  const templateType = toText(item.template_type || "bpmn_selection_v1");
  const count = Number(
    item.selection_count
    || item.bpmn_element_ids?.length
    || item.payload?.elements?.length
    || 0,
  );
  const updatedAt = Number(item.updated_at || item.created_at || 0);
  const canDelete = item.can_delete !== false;
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
            scope: {scopeLabel(item.scope)} · type: {typeLabel(templateType)} · count: {count || 0}
            {updatedAt > 0 ? ` · ${new Date(updatedAt).toLocaleString("ru-RU")}` : ""}
          </div>
          {templateType === "hybrid_stencil_v1" ? (
            <div className="mt-1 text-[11px] text-muted">
              stencil: {Number(item.payload?.elements?.length || 0)} elems · {Number(item.payload?.edges?.length || 0)} edges
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-muted">
              ids: {Array.isArray(item.bpmn_element_ids) && item.bpmn_element_ids.length ? item.bpmn_element_ids.join(", ") : "—"}
            </div>
          )}
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
            disabled={deleting || !canDelete}
            title={canDelete ? "Удалить шаблон" : "Недостаточно прав для удаления"}
            data-testid="template-pack-delete"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
