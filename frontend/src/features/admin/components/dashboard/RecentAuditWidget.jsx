import SectionCard from "../common/SectionCard";
import EmptyState from "../common/EmptyState";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";

export default function RecentAuditWidget({
  items = [],
}) {
  const rows = asArray(items);
  if (!rows.length) return <EmptyState title="Recent Audit" description="No recent audit events." />;
  return (
    <SectionCard title="Recent Audit" subtitle="Latest admin and workspace events" eyebrow="Trace">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">Action</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Actor</th>
              <th className="px-2 py-1.5 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, idx) => (
              <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.action || "action")}</td>
                <td className="px-2 py-2"><StatusPill status={row?.status} /></td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.actor || "unknown")}</td>
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

