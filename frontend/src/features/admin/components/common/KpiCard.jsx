import { toText } from "../../adminUtils";

export default function KpiCard({
  title = "",
  value = "—",
  hint = "",
  tone = "default",
}) {
  const toneClass = tone === "danger"
    ? "border-rose-200 bg-rose-50"
    : tone === "warn"
      ? "border-amber-200 bg-amber-50"
    : tone === "accent"
      ? "border-emerald-200 bg-emerald-50"
      : "border-slate-200 bg-white";
  return (
    <article className={`rounded-[22px] border p-4 shadow-sm ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{toText(title)}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      {toText(hint) ? <div className="mt-2 text-xs text-slate-500">{toText(hint)}</div> : null}
    </article>
  );
}
