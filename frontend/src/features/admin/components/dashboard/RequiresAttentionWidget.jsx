import SectionCard from "../common/SectionCard";
import EmptyState from "../common/EmptyState";
import { asArray, formatTs, toInt, toText } from "../../utils/adminFormat";

export default function RequiresAttentionWidget({
  items = [],
  onNavigate,
}) {
  const rows = asArray(items);
  if (!rows.length) return <EmptyState title="Requires Attention" description="No active attention rows." />;
  return (
    <SectionCard title="Requires Attention" subtitle="Sessions with active warning pressure" eyebrow="Hotspots">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">Session</th>
              <th className="px-2 py-1.5 font-medium">Warnings</th>
              <th className="px-2 py-1.5 font-medium">Updated</th>
              <th className="px-2 py-1.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={toText(row?.session_id)} className="border-t border-slate-100">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.session_name || row?.session_id)}</td>
                <td className="px-2 py-2">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    {toInt(row?.warnings_count, 0)} warnings
                  </span>
                </td>
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.updated_at)}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-emerald-700 hover:underline"
                    onClick={() => onNavigate?.(`/admin/sessions/${encodeURIComponent(toText(row?.session_id))}`)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

