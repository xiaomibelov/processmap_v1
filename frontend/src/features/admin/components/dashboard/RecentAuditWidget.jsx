import SectionCard from "../common/SectionCard";
import EmptyState from "../common/EmptyState";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { dashboardDict } from "./dashboardI18n";

// Актор в payload — user_id (hex). Email показываем целиком, иначе — первые 8 символов
// с полным значением в title (форматирование на фронте, API не меняется).
export function formatAuditActor(raw) {
  const text = toText(raw);
  if (!text) return { display: "—", full: "" };
  if (text.includes("@")) return { display: text, full: text };
  return { display: text.length > 8 ? text.slice(0, 8) : text, full: text };
}

export default function RecentAuditWidget({
  items = [],
}) {
  const d = dashboardDict();
  const dict = d.recentAudit;
  const rows = asArray(items);
  if (!rows.length) return <EmptyState title={dict.emptyTitle} description={dict.emptyDescription} />;
  return (
    <SectionCard title={dict.title} subtitle={dict.subtitle} eyebrow="Trace">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">{dict.colAction}</th>
              <th className="px-2 py-1.5 font-medium">{dict.colStatus}</th>
              <th className="px-2 py-1.5 font-medium">{dict.colActor}</th>
              <th className="px-2 py-1.5 font-medium">{dict.colTime}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, idx) => {
              const actor = formatAuditActor(row?.actor);
              return (
                <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.action || "action")}</td>
                  <td className="px-2 py-2"><StatusPill status={row?.status} /></td>
                  <td className="px-2 py-2 text-slate-600">
                    <span title={actor.full || undefined}>{actor.display}</span>
                  </td>
                  <td className="px-2 py-2 text-slate-500">{formatTs(row?.ts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
