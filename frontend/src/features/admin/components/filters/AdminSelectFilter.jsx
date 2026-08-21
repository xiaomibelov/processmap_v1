export default function AdminSelectFilter({
  value = "",
  onChange,
  options = [],
  testId = "",
}) {
  return (
    <select
      className="select h-11 min-h-0 rounded-2xl border-slate-200 bg-white"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      data-testid={testId || undefined}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

