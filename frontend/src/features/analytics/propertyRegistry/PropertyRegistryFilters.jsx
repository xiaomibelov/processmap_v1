import { PROPERTY_CATEGORIES, PROPERTY_SOURCES } from "./propertyRegistryUtils";

export default function PropertyRegistryFilters({ filters, onChange }) {
  return (
    <div className="propertyRegistryFilters">
      <input
        type="text"
        placeholder="Поиск по ID или названию"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="propertyRegistryFilterInput"
      />
      <select value={filters.category} onChange={(e) => onChange({ ...filters, category: e.target.value })} className="propertyRegistryFilterSelect">
        {PROPERTY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select value={filters.source} onChange={(e) => onChange({ ...filters, source: e.target.value })} className="propertyRegistryFilterSelect">
        {PROPERTY_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select value={filters.editable} onChange={(e) => onChange({ ...filters, editable: e.target.value })} className="propertyRegistryFilterSelect">
        <option value="all">Все</option>
        <option value="true">Редактируемые</option>
        <option value="false">Только чтение</option>
      </select>
    </div>
  );
}
