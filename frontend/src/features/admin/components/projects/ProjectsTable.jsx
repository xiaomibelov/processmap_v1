import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toInt, toText } from "../../utils/adminFormat";

export default function ProjectsTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Projects Table" subtitle="Project scope, session volume, and reporting posture" eyebrow="List">
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Project</th>
              <th className="px-3 py-3">Org</th>
              <th className="px-3 py-3">Owner</th>
              <th className="px-3 py-3">Sessions</th>
              <th className="px-3 py-3">Templates Used</th>
              <th className="px-3 py-3">Reports Status</th>
              <th className="px-3 py-3">Updated</th>
              <th className="px-3 py-3">Health</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={toText(row?.project_id)} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.name || row?.project_id)}</td>
                <td className="px-3 py-3 text-slate-500">Current org</td>
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

