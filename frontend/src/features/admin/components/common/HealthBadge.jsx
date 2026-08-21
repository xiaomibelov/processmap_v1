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
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${warning ? "bg-amber-500" : healthy ? "bg-emerald-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

