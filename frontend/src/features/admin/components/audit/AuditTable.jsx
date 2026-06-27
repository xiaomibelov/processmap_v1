import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function AuditTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.auditPage.table.title} subtitle={ru.admin.auditPage.table.subtitle} eyebrow={ru.admin.common.listEyebrow}>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.timestamp}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.action}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.status}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.actor}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.entity}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.project}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.auditPage.table.session}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.ts)}</td>
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.action || "action")}</td>
                <td className="px-2 py-2"><StatusPill status={row?.status || "unknown"} compact /></td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.actor_user_id || "—")}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.entity_type || "—")} / {toText(row?.entity_id || "—")}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.project_id || "—")}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.session_id || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
