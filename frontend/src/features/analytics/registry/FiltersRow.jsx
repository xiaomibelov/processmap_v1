function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function FiltersRow({ filters = [], values = {}, onChange = null, onReset = null }) {
  const hasActive = Object.entries(values || {}).some(([k, v]) => {
    if (k === "completeness") return toText(v) !== "" && toText(v) !== "all";
    return toText(v) !== "";
  });

  return (
    <div className="registryFiltersRow" data-testid="registry-filters-row">
      <div className="registryFiltersList">
        {filters.map((f) => (
          <div key={f.id} className="registryFilterItem">
            <label className="registryFilterLabel">{f.label}</label>
            <select
              className="registryFilterSelect"
              value={toText(values[f.id])}
              onChange={(e) => onChange?.(f.id, e.target.value)}
              data-testid={`registry-filter-${f.id}`}
            >
              <option value="">Все</option>
              {toArray(f.options).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {hasActive ? (
        <button type="button" className="registryFilterReset" onClick={onReset} data-testid="registry-filters-reset">
          Сбросить фильтры
        </button>
      ) : null}
    </div>
  );
}
