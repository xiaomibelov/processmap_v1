import { asArray, toInt, toText } from "../../utils/adminFormat";
import { dashboardDict } from "./dashboardI18n";

export default function AttentionSection({ items = [], onNavigate }) {
  const d = dashboardDict();
  const rows = asArray(items);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" data-testid="attention-strip">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{d.attentionEyebrow}</div>
          <h2 className="text-sm font-semibold text-slate-950">{d.attentionTitle}</h2>
        </div>
        {rows.length === 0 ? (
          <span className="text-sm text-slate-500" data-testid="attention-clear">
            <span aria-hidden="true" className="mr-1 text-emerald-600">✓</span>
            {d.attentionAllClear}
          </span>
        ) : (
          <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="list">
            {rows.map((row) => {
              const kind = toText(row?.kind) || toText(row?.label) || "signal";
              const href = toText(row?.href);
              const label = toText(row?.label) || kind;
              const count = toInt(row?.count, 0);
              const clickable = Boolean(href) && typeof onNavigate === "function";
              const className = "flex min-h-[44px] items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-left hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500".trim();
              return (
                <li key={kind} data-testid={`attention-row-${kind}`}>
                  {clickable ? (
                    <button
                      type="button"
                      data-testid={`attention-link-${kind}`}
                      className={className}
                      title={label}
                      onClick={() => onNavigate(href)}
                    >
                      <span className="min-w-0 truncate text-sm text-slate-800">{label}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{count}</span>
                      <span aria-hidden="true" className="text-xs text-amber-700">→</span>
                        </button>
                  ) : (
                    <span className={className}>
                      <span className="min-w-0 truncate text-sm text-slate-800">{label}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{count}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
