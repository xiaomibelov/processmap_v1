import SidebarSection from "./SidebarSection";
import TldrCard from "../../features/tldr/ui/TldrCard";

export default function TemplatesAndTldrSection({
  open,
  onToggle,
  contentOnly = false,
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

  const content = (
    <>
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

          <TldrCard
            summary={selectedElementSummary}
            busy={tldrBusy}
            error={tldrErr}
            status={tldrStatus}
            disabled={disabled}
            onGenerate={onGenerateTldr}
          />
        </>
      )}
    </>
  );

  if (contentOnly) return <div className="sidebarAccordionContent">{content}</div>;

  return (
    <SidebarSection
      sectionId="templates"
      title="Шаблоны и TL;DR"
      summary={summary}
      open={open}
      onToggle={onToggle}
      badge={selectedElementSummary ? "DONE" : ""}
    >
      {content}
    </SidebarSection>
  );
}
