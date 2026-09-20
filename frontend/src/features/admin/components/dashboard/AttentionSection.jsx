import SectionCard from "../common/SectionCard";
import { asArray, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function AttentionSection({ items = [], onNavigate }) {
  const d = ru.admin.dashboardPage;
  const rows = asArray(items);
  return (
    <SectionCard eyebrow={d.attentionEyebrow} title={d.attentionTitle} subtitle={d.attentionSubtitle}>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="attention-empty">{d.attentionEmpty}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const kind = toText(row?.kind) || toText(row?.label) || "signal";
            const href = toText(row?.href);
            return (
              <li key={kind} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2" data-testid={`attention-row-${kind}`}>
                <span className="min-w-0 text-sm text-slate-800">{toText(row?.label) || kind}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{toInt(row?.count, 0)}</span>
                  {href && typeof onNavigate === "function" ? (
                    <button
                      type="button"
                      data-testid={`attention-link-${kind}`}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                      onClick={() => onNavigate(href)}
                    >
                      {d.openSection} →
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
