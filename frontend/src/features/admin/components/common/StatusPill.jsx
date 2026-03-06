import { ADMIN_STATUS_META } from "../../constants/adminStatusMeta";
import { toText } from "../../adminUtils";

export default function StatusPill({
  status = "",
  tone = "",
  label = "",
}) {
  const normalized = toText(status).toLowerCase();
  const meta = ADMIN_STATUS_META[normalized] || ADMIN_STATUS_META.unknown;
  const resolvedTone = tone || meta.tone || "default";
  const cls = resolvedTone === "danger"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : resolvedTone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : resolvedTone === "accent" || resolvedTone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-100 text-slate-700";
  const text = toText(label) ? `${toText(label)}: ${toText(status || meta.label)}` : toText(status || meta.label || "—");
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      {text}
    </span>
  );
}

