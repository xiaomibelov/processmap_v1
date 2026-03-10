export default function HealthBadge({
  label = "",
  healthy = false,
  warning = false,
}) {
  const cls = warning
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : healthy
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${warning ? "bg-amber-500" : healthy ? "bg-emerald-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

