import SidebarSection from "./SidebarSection";

export default function TemplatesAndTldrSection({
  open,
  onToggle,
  selectedElementId,
  selectedTemplate,
  selectedElementSummary,
  disabled,
  elementBusy,
  tldrBusy,
  onInsertTemplate,
  onGenerateTldr,
  templateErr,
  tldrErr,
  tldrStatus,
}) {
  const hasSelected = !!selectedElementId;
  const summary = hasSelected
    ? `Шаблон: ${selectedTemplate?.title || "—"} · TL;DR: ${selectedElementSummary ? "готово" : "нет"}`
    : "Выберите узел для шаблона";

  return (
    <SidebarSection
      sectionId="templates"
      title="Шаблоны и TL;DR"
      summary={summary}
      open={open}
      onToggle={onToggle}
      badge={selectedElementSummary ? "DONE" : ""}
    >
      {!hasSelected ? (
        <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
          Выберите узел на диаграмме, чтобы вставлять шаблоны и готовить TL;DR.
        </div>
      ) : (
        <>
          <div className="mt-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Шаблоны</div>
            <div className="mt-1 rounded-md border border-border bg-panel2 px-2 py-2 text-xs text-muted">
              {selectedTemplate?.title || "Шаблон заметки"} · {selectedTemplate?.bullets?.length || 0} полей
            </div>
            <button
              type="button"
              className="primaryBtn mt-2 w-full"
              onClick={() => {
                void onInsertTemplate?.();
              }}
              disabled={!!disabled || !!elementBusy}
              data-testid="notes-template-insert"
            >
              Вставить шаблон
            </button>
            {templateErr ? <div className="mt-2 text-[11px] text-danger">{templateErr}</div> : null}
          </div>

          <div className="mt-3 border-t border-border/70 pt-2" data-testid="notes-tldr-panel">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">TL;DR</div>
            {selectedElementSummary ? (
              <div className="mt-1 rounded-md border border-border bg-panel2 px-2 py-2 text-xs whitespace-pre-wrap" data-testid="notes-tldr-summary">
                {selectedElementSummary}
              </div>
            ) : (
              <div className="mt-1 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
                Краткое резюме пока не сформировано.
              </div>
            )}
            <button
              type="button"
              className="primaryBtn mt-2 w-full"
              onClick={() => {
                void onGenerateTldr?.();
              }}
              disabled={!!disabled || !!tldrBusy}
              data-testid="notes-tldr-generate"
            >
              {tldrBusy ? "Сжимаю..." : "Сжать заметку"}
            </button>
            {tldrErr ? <div className="mt-2 text-[11px] text-danger">{tldrErr}</div> : null}
            {!tldrErr && tldrStatus ? <div className="mt-2 text-[11px] text-success">{tldrStatus}</div> : null}
          </div>
        </>
      )}
    </SidebarSection>
  );
}
