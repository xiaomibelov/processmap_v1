import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, toText } from "../../utils/adminFormat";

export default function OrgsTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Organizations Table" subtitle="Membership-backed org listing in current scope" eyebrow="List">
      <div className="overflow-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Org</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Members</th>
              <th className="px-3 py-3">Projects</th>
              <th className="px-3 py-3">Active Sessions</th>
              <th className="px-3 py-3">Pending Invites</th>
              <th className="px-3 py-3">Health</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${toText(row?.org_id || row?.id)}_${idx}`} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.name || row?.org_name || row?.org_id || row?.id)}</td>
                <td className="px-3 py-3 text-slate-600">{toText(row?.role || "viewer")}</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3 text-slate-500">—</td>
                <td className="px-3 py-3"><StatusPill status="scoped" tone="default" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

