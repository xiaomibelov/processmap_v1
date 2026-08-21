import { ru } from "../../../../shared/i18n/ru";

export default function AdminDateRangeFilter({
  value = "",
  onChange,
}) {
  return (
    <select
      className="select h-11 min-h-0 rounded-2xl border-slate-200 bg-white"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">{ru.admin.filters.dateRange.all}</option>
      <option value="24h">{ru.admin.filters.dateRange.last24h}</option>
      <option value="7d">{ru.admin.filters.dateRange.last7d}</option>
      <option value="30d">{ru.admin.filters.dateRange.last30d}</option>
    </select>
  );
}
