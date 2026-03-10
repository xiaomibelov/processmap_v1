export default function AdminSearchInput({
  value = "",
  onChange,
  placeholder = "Search…",
  testId = "",
}) {
  return (
    <input
      className="input h-11 rounded-2xl border-slate-200 bg-white"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      data-testid={testId || undefined}
    />
  );
}

