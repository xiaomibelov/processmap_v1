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
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.project}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.org}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.owner}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.sessions}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.templatesUsed}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.reportsStatus}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.updated}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.projectsPage.table.health}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={toText(row?.project_id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.name || row?.project_id)}</td>
                <td className="px-2 py-2 text-slate-500">{ru.admin.projectsPage.table.currentOrg}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.owner || row?.owner_id || "—")}</td>
                <td className="px-2 py-2 text-slate-600">{toInt(row?.session_count, 0)}</td>
                <td className="px-2 py-2 text-slate-500">—</td>
                <td className="px-2 py-2"><StatusPill status={toInt(row?.session_count, 0) > 0 ? "active" : "idle"} tone={toInt(row?.session_count, 0) > 0 ? "accent" : "default"} compact /></td>
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.updated_at)}</td>
                <td className="px-2 py-2"><StatusPill status={toInt(row?.session_count, 0) > 0 ? "healthy" : "empty"} tone={toInt(row?.session_count, 0) > 0 ? "ok" : "warn"} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
