import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";

export default function AuditTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Audit Table" subtitle="Operational event stream with actor and entity context" eyebrow="List">
      <div className="overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Timestamp</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actor</th>
              <th className="px-3 py-3">Entity</th>
              <th className="px-3 py-3">Project</th>
              <th className="px-3 py-3">Session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100">
                <td className="px-3 py-3 text-slate-500">{formatTs(row?.ts)}</td>
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.action || "action")}</td>
                <td className="px-3 py-3"><StatusPill status={row?.status || "unknown"} /></td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.actor_user_id || "—")}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.entity_type || "—")} / {toText(row?.entity_id || "—")}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.project_id || "—")}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.session_id || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

