// ToBeBuilder (property-panel-redesign, Phase 2).
//
// Summary pills + As-Is list (configured properties) + Pool list (dictionary
// and To-Be fields not yet configured). Row click toggles To-Be membership;
// the Pool "+" adds the field to the element draft (existing CRUD pipeline,
// persists on the global Save). Badge/pill terms follow the user document.

const BADGE_CLASS = {
  "In To-Be": "toBeBadge toBeBadge--inToBe",
  "Added": "toBeBadge toBeBadge--added",
  "Removed": "toBeBadge toBeBadge--removed",
  "Not filled": "toBeBadge toBeBadge--notFilled",
};

function badgeClass(badge) {
  return BADGE_CLASS[badge] || "toBeBadge toBeBadge--notFilled";
}

function ToBeRow({ row, disabled, onToggleToBe, onAddFromPool }) {
  return (
    <div className="toBeRow" role="listitem">
      <button
        type="button"
        className="toBeRowToggle"
        aria-pressed={row.badge === "In To-Be"}
        disabled={disabled}
        onClick={() => onToggleToBe?.(row.name)}
        data-testid={`to-be-toggle-${row.name}`}
      >
        <span className="toBeRowName">{row.name}</span>
        <span className={badgeClass(row.badge)}>{row.badge}</span>
      </button>
      {onAddFromPool && (
        <button
          type="button"
          className="toBeAddBtn"
          aria-label={`Добавить ${row.name} в To-Be`}
          disabled={disabled}
          onClick={() => onAddFromPool?.(row.name)}
          data-testid={`to-be-add-${row.name}`}
        >
          +
        </button>
      )}
    </div>
  );
}

export default function ToBeBuilder({
  asIs = [],
  pool = [],
  inToBeCount = 0,
  skippedCount = 0,
  disabled = false,
  onAddFromPool,
  onToggleToBe,
  hideHeader = false,
}) {
  return (
    <div className="toBeBuilder" data-testid="to-be-builder">
      {!hideHeader && (
        <div className="toBeSummary">
          <span className="overlayDisplayLabel">To-Be</span>
          <span className="toBePills">{inToBeCount} in To-Be / {skippedCount} skipped</span>
        </div>
      )}

      <div className="toBeSection">
        <span className="toBeSectionTitle">Настроено</span>
        {asIs.length === 0 ? (
          <div className="toBeEmpty">Нет настроенных свойств</div>
        ) : (
          <div className="toBeList" role="list" aria-label="Настроено">
            {asIs.map((row) => (
              <ToBeRow
                key={row.name}
                row={row}
                disabled={disabled}
                onToggleToBe={onToggleToBe}
              />
            ))}
          </div>
        )}
      </div>

      <div className="toBeSection">
        <span className="toBeSectionTitle">Не заполнено</span>
        {pool.length === 0 ? (
          <div className="toBeEmpty">Нет полей для добавления</div>
        ) : (
          <div className="toBeList" role="list" aria-label="Не заполнено">
            {pool.map((row) => (
              <ToBeRow
                key={row.name}
                row={row}
                disabled={disabled}
                onToggleToBe={onToggleToBe}
                onAddFromPool={onAddFromPool}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
