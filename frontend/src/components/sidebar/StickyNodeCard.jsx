import {
  normalizeBpmnTypeLabel,
  normalizeSecondaryLine,
  normalizeTemplateLabel,
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

export default function StickyNodeCard({
  selectedElementId,
  selectedElementName,
  selectedElementType,
  selectedElementLaneName,
  aiCount,
  noteCount,
  templateTitle,
}) {
  const hasSelected = !!selectedElementId;
  const label = selectedElementName || selectedElementId || "";
  const typeLabel = normalizeBpmnTypeLabel(selectedElementType);
  const secondaryLine = normalizeSecondaryLine(selectedElementLaneName, typeLabel);
  const normalizedTemplate = normalizeTemplateLabel(templateTitle);

  if (!hasSelected) {
    return (
      <div className="stickyNodeCard isEmpty">
        <div className="stickyNodeTitle">Узел не выбран</div>
        <div className="stickyNodeEmptyHint">
          Кликните на узел диаграммы, чтобы увидеть AI-вопросы и заметки.
        </div>
      </div>
    );
  }

  return (
    <div className="stickyNodeCard selectedNodeCard">
      <div className="stickyNodeHead selectedNodeHeader">
        <div className="min-w-0 flex-1">
          <div className="stickyNodeTitle selectedNodeTitle truncate" title={label}>{label}</div>
          {secondaryLine ? (
            <div className="stickyNodeSub selectedNodeSecondary" title={selectedElementLaneName || selectedElementType || ""}>
              {secondaryLine}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="sidebarIconBtn selectedNodeCopyBtn"
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
      <div className="selectedNodeMetaRow">
        {typeLabel ? (
          <span className="selectedNodeChip" title={selectedElementType || typeLabel}>
            Тип: {typeLabel}
          </span>
        ) : null}
        <span className="selectedNodeChip selectedNodeChip--id" title={selectedElementId}>
          <span className="selectedNodeChipLabel">ID:</span>
          <span className="selectedNodeChipValue">{selectedElementId}</span>
        </span>
        <span className="selectedNodeChip">AI {Number(aiCount || 0)}</span>
        <span className="selectedNodeChip">Заметки {Number(noteCount || 0)}</span>
      </div>
      {normalizedTemplate ? (
        <div className="selectedNodeTemplateRow">
          <span className="selectedNodeChip selectedNodeChip--template" title={normalizedTemplate}>
            Шаблон: {normalizedTemplate}
          </span>
        </div>
      ) : null}
    </div>
  );
}
