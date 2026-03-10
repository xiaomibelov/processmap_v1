import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function ProjectsTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.projectsPage.table.title} subtitle={ru.admin.projectsPage.table.subtitle} eyebrow={ru.admin.common.listEyebrow}>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.project}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.org}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.owner}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.sessions}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.templatesUsed}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.reportsStatus}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.updated}</th>
              <th className="px-3 py-3">{ru.admin.projectsPage.table.health}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={toText(row?.project_id)} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.name || row?.project_id)}</td>
                <td className="px-3 py-3 text-slate-500">{ru.admin.projectsPage.table.currentOrg}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.owner || row?.owner_id || "—")}</td>
                <td className="px-3 py-3 text-slate-600">{toInt(row?.session_count, 0)}</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3"><StatusPill status={toInt(row?.session_count, 0) > 0 ? "active" : "idle"} tone={toInt(row?.session_count, 0) > 0 ? "accent" : "default"} /></td>
                <td className="px-3 py-3 text-slate-500">{formatTs(row?.updated_at)}</td>
                <td className="px-3 py-3"><StatusPill status={toInt(row?.session_count, 0) > 0 ? "healthy" : "empty"} tone={toInt(row?.session_count, 0) > 0 ? "ok" : "warn"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
