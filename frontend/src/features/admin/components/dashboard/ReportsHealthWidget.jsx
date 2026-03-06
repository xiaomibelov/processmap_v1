import ChartCard from "../common/ChartCard";
import { formatPct, toInt } from "../../utils/adminFormat";

export default function ReportsHealthWidget({
  payload = {},
}) {
  return (
    <ChartCard title="Report / Doc Health" subtitle="Report/doc completion posture across sessions" eyebrow="Outputs">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Report Ready</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{toInt(payload.reports_ready, 0)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Doc Ready</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{toInt(payload.doc_ready, 0)}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700">Pending</div>
          <div className="mt-2 text-2xl font-semibold text-amber-900">{toInt(payload.pending, 0)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">Completion Rate</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">{formatPct(payload.completion_rate_pct)}</div>
        </div>
      </div>
    </ChartCard>
  );
}

