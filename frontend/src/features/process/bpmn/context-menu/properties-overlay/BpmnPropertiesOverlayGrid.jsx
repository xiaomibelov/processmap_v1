import React from "react";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function readDraftValue(draftByRowId, rowId) {
  if (!draftByRowId || typeof draftByRowId !== "object") return "";
  return String(draftByRowId[rowId] ?? "");
}

function handleRowKeyDown(event, row, value, handlers) {
  const key = String(event?.key || "");
  if (key === "Escape") {
    event.preventDefault();
    handlers.onCancel?.(row.id);
    return;
  }
  if (key !== "Enter") return;
  if (toText(row?.kind) === "documentation" && event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.dataset.skipBlurSave = "1";
  handlers.onSubmit?.(row.id, value);
  event.currentTarget.blur();
}

function handleRowBlur(event, row, value, handlers) {
  if (event.currentTarget?.dataset?.skipBlurSave === "1") {
    event.currentTarget.dataset.skipBlurSave = "";
    return;
  }
  handlers.onSubmit?.(row.id, value);
}

export default function BpmnPropertiesOverlayGrid({
  schema,
  draftByRowId,
  savingRowId = "",
  onDraftChange,
  onSubmit,
  onCancel,
}) {
  const sections = asArray(schema?.sections);
  if (!sections.length) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
        Для элемента нет доступных свойств.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="bpmn-properties-overlay-grid">
      {sections.map((sectionRaw) => {
        const section = sectionRaw && typeof sectionRaw === "object" ? sectionRaw : {};
        const rows = asArray(section?.rows);
        if (!rows.length) return null;
        return (
          <section
            key={`bpmn_properties_overlay_section_${toText(section?.id || section?.title)}`}
            className="rounded-lg border border-border/80 bg-panel2/35"
          >
            <header className="border-b border-border/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {toText(section?.title)}
            </header>
            <div className="divide-y divide-border/60">
              {rows.map((rowRaw) => {
                const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
                const rowId = toText(row?.id);
                const value = readDraftValue(draftByRowId, rowId);
                const rowSaving = rowId && toText(savingRowId) === rowId;
                const editable = row?.editable === true;
                const textarea = toText(row?.kind) === "documentation";

                return (
                  <div
                    key={`bpmn_properties_overlay_row_${rowId}`}
                    className="grid grid-cols-[minmax(120px,190px)_minmax(0,1fr)] items-start gap-2 px-3 py-2"
                    data-testid={`bpmn-properties-overlay-row-${rowId}`}
                  >
                    <div className="pt-1 text-[11px] font-medium text-muted">{toText(row?.label)}</div>
                    <div>
                      {editable ? (
                        textarea ? (
                          <textarea
                            className="input min-h-[66px] w-full resize-y text-xs"
                            value={value}
                            disabled={rowSaving}
                            onChange={(event) => onDraftChange?.(rowId, event.target.value)}
                            onKeyDown={(event) => handleRowKeyDown(event, row, value, { onSubmit, onCancel })}
                            onBlur={(event) => handleRowBlur(event, row, value, { onSubmit })}
                            data-testid={`bpmn-properties-overlay-input-${rowId}`}
                          />
                        ) : (
                          <input
                            className="input h-8 w-full text-xs"
                            value={value}
                            disabled={rowSaving}
                            onChange={(event) => onDraftChange?.(rowId, event.target.value)}
                            onKeyDown={(event) => handleRowKeyDown(event, row, value, { onSubmit, onCancel })}
                            onBlur={(event) => handleRowBlur(event, row, value, { onSubmit })}
                            data-testid={`bpmn-properties-overlay-input-${rowId}`}
                          />
                        )
                      ) : (
                        <div className="rounded-md border border-border/70 bg-panel px-2 py-1.5 text-xs text-fg/90" data-testid={`bpmn-properties-overlay-value-${rowId}`}>
                          {value || "—"}
                        </div>
                      )}
                      {rowSaving ? <div className="mt-1 text-[10px] text-muted">Сохраняю...</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
