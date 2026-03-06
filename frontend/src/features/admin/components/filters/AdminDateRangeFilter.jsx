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
      <option value="">All time</option>
      <option value="24h">Last 24h</option>
      <option value="7d">Last 7d</option>
      <option value="30d">Last 30d</option>
    </select>
  );
}

