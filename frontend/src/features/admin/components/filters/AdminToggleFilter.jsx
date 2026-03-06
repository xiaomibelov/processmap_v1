export default function AdminToggleFilter({
  checked = false,
  onChange,
  label = "",
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

