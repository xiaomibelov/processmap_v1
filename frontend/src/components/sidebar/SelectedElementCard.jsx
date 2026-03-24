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
  incomingCount = 0,
  outgoingCount = 0,
  robotMetaStatus = "none",
  robotMetaMissing = [],
}) {
  const hasSelected = !!selectedElementId;
  const typeLabel = normalizeBpmnTypeLabel(selectedElementType);
  const secondaryLine = normalizeSecondaryLine(selectedElementLaneName, typeLabel);
  const robotStatusLabel = String(robotMetaStatus || "none").toLowerCase();
  const missing = Array.isArray(robotMetaMissing) ? robotMetaMissing.filter(Boolean) : [];
  const shortId = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.length <= 20) return raw;
    return `${raw.slice(0, 12)}…${raw.slice(-6)}`;
  };

  return (
    <section className="sidebarCardSurface selectedElementCard">
      <div className="mb-1">
        <div className="sidebarSectionCaption">Выбранный элемент</div>
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
          <div className="selectedElementMeta mt-2" role="list" aria-label="Краткая мета информация">
            <span className="sidebarBadge" role="listitem" title={selectedElementId}>
              ID: {shortId(selectedElementId)}
            </span>
            <span className="sidebarBadge" role="listitem">in {Number(incomingCount || 0)}</span>
            <span className="sidebarBadge" role="listitem">out {Number(outgoingCount || 0)}</span>
            <span className={`sidebarBadge sidebarBadgeRobot sidebarBadgeRobot--${robotStatusLabel}`} role="listitem" title={missing.length ? `missing: ${missing.join(", ")}` : "robot status"}>
              robot: {robotStatusLabel}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
