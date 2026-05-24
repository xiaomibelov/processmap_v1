export const FILTERS = [
  ["product_group", "Группа"],
  ["product_name", "Товар"],
  ["action_type", "Тип"],
  ["action_stage", "Этап"],
  ["action_object_category", "Категория"],
  ["role", "Роль"],
];

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function ProductActionsRegistryFilters({
  filters = {},
  filterOptions = {},
  onChange,
  onReset,
}) {
  return (
    <section className="productActionsRegistryFilters" data-testid="product-actions-registry-filters">
      <div className="productActionsRegistryFiltersToolbar">
        {FILTERS.map(([key, label]) => (
          <label key={key} className="productActionsRegistryFilterItem">
            <span>{label}</span>
            <select
              value={toText(filters[key])}
              onChange={(event) => onChange?.(key, event.target.value)}
            >
              <option value="">Все</option>
              {toArray(filterOptions[key]).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="productActionsRegistryFilterItem">
          <span>Полнота</span>
          <select
            value={filters.completeness || "all"}
            onChange={(event) => onChange?.("completeness", event.target.value)}
          >
            <option value="all">Все</option>
            <option value="complete">Полные</option>
            <option value="incomplete">Неполные</option>
          </select>
        </label>
        <button
          type="button"
          className="productActionsRegistryFilterReset"
          onClick={onReset}
        >
          Сбросить фильтры
        </button>
      </div>
      <p className="productActionsRegistryFiltersHint">
        Фильтры применяются к загруженным строкам.
      </p>
    </section>
  );
}
