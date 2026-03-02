import {
  normalizeBpmnTypeLabel,
  normalizeSecondaryLine,
} from "./selectedNodeUi";

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

export default function SelectedElementCard({
  selectedElementId,
  selectedElementName,
  selectedElementType,
  selectedElementLaneName,
  noteCount,
  aiCount,
  open,
  onToggle,
}) {
  const hasSelected = !!selectedElementId;
  const typeLabel = normalizeBpmnTypeLabel(selectedElementType);
  const secondaryLine = normalizeSecondaryLine(selectedElementLaneName, typeLabel);

  return (
    <section className="sidebarCardSurface selectedElementCard">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="sidebarSectionCaption">Выбранный элемент</div>
        <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={onToggle}>
          {open ? "Свернуть" : "Развернуть"}
        </button>
      </div>

      {!hasSelected ? (
        <div className="sidebarNodeEmptyCard" role="status" aria-live="polite">
          <div className="sidebarNodeEmptyIcon" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M3 8h10M8 3v10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-fg">Узел не выбран</div>
            <div className="mt-0.5 text-[11px] text-muted">Выберите элемент на диаграмме.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="selectedElementTitleWrap">
            <div className="selectedElementTitle" title={selectedElementName || selectedElementId}>
              {selectedElementName || selectedElementId}
            </div>
            <button
              type="button"
              className="sidebarIconBtn"
              title={`Скопировать ID: ${selectedElementId}`}
              onClick={() => {
                void copyText(selectedElementId);
              }}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                <rect x="5" y="3" width="8" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <rect x="3" y="5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.78" />
              </svg>
            </button>
          </div>
          {secondaryLine ? (
            <div className="selectedElementSubtitle" title={selectedElementLaneName || selectedElementType || ""}>
              {secondaryLine}
            </div>
          ) : null}
          {open ? (
            <div className="selectedElementMeta mt-2" role="list" aria-label="Свойства элемента">
              {typeLabel ? <span className="sidebarBadge" role="listitem">Type: {typeLabel}</span> : null}
              <span className="sidebarBadge" role="listitem" title={selectedElementId}>ID: {selectedElementId.slice(0, 22)}{selectedElementId.length > 22 ? "…" : ""}</span>
              <span className="sidebarBadge" role="listitem">AI {Number(aiCount || 0)}</span>
              <span className="sidebarBadge" role="listitem">Notes {Number(noteCount || 0)}</span>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
