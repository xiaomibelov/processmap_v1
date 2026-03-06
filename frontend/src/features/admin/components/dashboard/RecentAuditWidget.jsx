import ChartCard from "../common/ChartCard";
import EmptyState from "../common/EmptyState";
import StatusPill from "../common/StatusPill";
import { asArray, formatTs, toText } from "../../utils/adminFormat";

export default function RecentAuditWidget({
  items = [],
}) {
  const rows = asArray(items);
  if (!rows.length) return <EmptyState title="Recent Audit" description="No recent audit events." />;
  return (
    <ChartCard title="Recent Audit" subtitle="Latest admin and workspace events" eyebrow="Trace">
      <div className="space-y-3">
        {rows.slice(0, 8).map((row, idx) => (
          <div key={`${toText(row?.id)}_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-950">{toText(row?.action || "action")}</div>
              <StatusPill status={row?.status} />
            </div>
            <div className="mt-1 text-xs text-slate-500">{toText(row?.actor || "unknown")} · {formatTs(row?.ts)}</div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

