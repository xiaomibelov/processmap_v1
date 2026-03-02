function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function noteText(value) {
  return String(value?.text || value?.notes || value || "").trim();
}

function noteAuthor(value) {
  return String(value?.author || value?.user || value?.created_by || "you").trim() || "you";
}

function compactTime(value) {
  const ts = Number(value || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts).toLocaleString("ru-RU", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ElementNotesAccordionContent({
  selectedElementId,
  selectedElementName,
  selectedElementNotes,
  noteCount,
  elementText,
  onElementTextChange,
  onSendElementNote,
  elementBusy,
  elementErr,
  onNodeEditorRef,
  disabled,
}) {
  const list = [...asArray(selectedElementNotes)].slice(-10).reverse();
  const hasUnsaved = String(elementText || "").trim().length > 0;

  if (!selectedElementId) {
    return <div className="sidebarEmptyHint">Выберите узел для заметок.</div>;
  }

  return (
    <div className="sidebarControlStack">
      <div className="text-[11px] text-muted">
        Узел: <span className="text-fg">{selectedElementName || selectedElementId}</span>
      </div>
      {list.length ? (
        <div className="sidebarMiniList">
          {list.map((item, idx) => (
            <div key={item?.id || `node_note_${idx + 1}`} className="sidebarMiniItem">
              <div className="sidebarMiniItemText">{noteText(item)}</div>
              <div className="sidebarMiniItemMeta">
                {noteAuthor(item)}
                {compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)
                  ? ` · ${compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)}`
                  : ""}
                <span className="ml-1 text-[10px] text-muted/80">#{Math.max(1, Number(noteCount || 0) - idx)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sidebarEmptyHint">Пока нет заметок для выбранного узла.</div>
      )}

      {elementErr ? <div className="selectedNodeFieldError">{elementErr}</div> : null}
      <textarea
        ref={(node) => onNodeEditorRef?.(node)}
        className="input min-w-0"
        placeholder="Заметка для выбранного узла..."
        value={elementText}
        onChange={(event) => onElementTextChange?.(event.target.value)}
        rows={3}
        style={{ resize: "vertical" }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void onSendElementNote?.();
          }
        }}
        disabled={!!disabled || !!elementBusy}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">{hasUnsaved ? "Есть несохранённые изменения" : "Сохранено"}</span>
        <button
          type="button"
          className="primaryBtn h-8 px-3 text-[11px]"
          onClick={() => {
            void onSendElementNote?.();
          }}
          disabled={!!disabled || !!elementBusy}
        >
          {elementBusy ? "Сохраняю..." : "Сохранить заметку"}
        </button>
      </div>
    </div>
  );
}
