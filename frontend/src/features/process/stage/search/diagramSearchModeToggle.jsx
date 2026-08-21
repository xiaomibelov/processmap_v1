import { resolveNextSearchMode } from "./diagramSearchInlineModel.js";

function toText(value) {
  return String(value || "").trim();
}

export default function DiagramSearchModeToggle({ mode = "elements", onModeChange = null }) {
  const modeKey = toText(mode).toLowerCase() === "properties" ? "properties" : "elements";
  const applyMode = (requested) => {
    const next = resolveNextSearchMode(modeKey, requested);
    if (next !== modeKey) onModeChange?.(next);
  };
  return (
    <div className="diagramSearchInlineToggle" role="tablist" aria-label="Область поиска">
      <button
        type="button"
        role="tab"
        aria-selected={modeKey === "elements"}
        className={`diagramSearchInlineToggleBtn ${modeKey === "elements" ? "isActive" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyMode("elements")}
        data-testid="diagram-action-search-mode-elements"
      >
        Элементы
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={modeKey === "properties"}
        className={`diagramSearchInlineToggleBtn ${modeKey === "properties" ? "isActive" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyMode("properties")}
        data-testid="diagram-action-search-mode-properties"
      >
        Свойства
      </button>
    </div>
  );
}
