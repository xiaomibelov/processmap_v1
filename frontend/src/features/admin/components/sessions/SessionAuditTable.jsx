import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";

export default function SessionAuditTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Session Audit" subtitle="Per-session event history" eyebrow="Trace">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">Action</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Actor</th>
              <th className="px-2 py-1.5 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, idx) => (
              <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.action || "action")}</td>
                <td className="px-2 py-2"><StatusPill status={row?.status || "ok"} compact /></td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.actor_user_id || "unknown")}</td>
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.ts)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-xs text-slate-500">
                  No session audit rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
