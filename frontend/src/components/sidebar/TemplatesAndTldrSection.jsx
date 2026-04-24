import SidebarSection from "./SidebarSection";

export default function TemplatesAndTldrSection({
  open,
  onToggle,
  contentOnly = false,
  selectedElementId,
  selectedTemplate,
  disabled,
  elementBusy,
  onInsertTemplate,
  templateErr,
}) {
  const hasSelected = !!selectedElementId;
  const summary = hasSelected
    ? `Шаблон: ${selectedTemplate?.title || "—"}`
    : "Выберите узел для шаблона";

  const content = (
    <>
      {!hasSelected ? (
        <div className="mt-2 rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
          Выберите узел на диаграмме, чтобы вставлять шаблоны.
        </div>
      ) : (
        <>
          <div className="mt-2">
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
        </>
      )}
    </>
  );

  if (contentOnly) return <div className="sidebarAccordionContent">{content}</div>;

  return (
    <SidebarSection
      sectionId="templates"
      title="Шаблоны"
      summary={summary}
      open={open}
      onToggle={onToggle}
    >
      {content}
    </SidebarSection>
  );
}
