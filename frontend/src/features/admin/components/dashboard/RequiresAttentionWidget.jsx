import ChartCard from "../common/ChartCard";
import EmptyState from "../common/EmptyState";
import { asArray, formatTs, toInt, toText } from "../../utils/adminFormat";

export default function RequiresAttentionWidget({
  items = [],
  onNavigate,
}) {
  const rows = asArray(items);
  if (!rows.length) return <EmptyState title="Requires Attention" description="No active attention rows." />;
  return (
    <ChartCard title="Requires Attention" subtitle="Sessions with active warning pressure" eyebrow="Hotspots">
      <div className="space-y-3">
        {rows.slice(0, 8).map((row) => (
          <div key={toText(row?.session_id)} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-950">{toText(row?.session_name || row?.session_id)}</div>
                <div className="mt-1 text-xs text-slate-500">Updated {formatTs(row?.updated_at)}</div>
              </div>
              <div className="rounded-full bg-white px-2 py-1 text-xs text-amber-700">
                {toInt(row?.warnings_count, 0)} warnings
              </div>
            </div>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-emerald-700 hover:underline"
              onClick={() => onNavigate?.(`/admin/sessions/${encodeURIComponent(toText(row?.session_id))}`)}
            >
              Open diagnostics
            </button>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

