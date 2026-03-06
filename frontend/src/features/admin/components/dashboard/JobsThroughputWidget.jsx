import ChartCard from "../common/ChartCard";
import { formatDurationSeconds, toInt, toText } from "../../utils/adminFormat";

export default function JobsThroughputWidget({
  payload = {},
}) {
  return (
    <ChartCard title="Jobs Throughput" subtitle="Queue state, completions, and contention" eyebrow="Execution">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Queue Depth</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{toInt(payload.queue_depth, 0)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">AutoPass Runs</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{toInt(payload.autopass_runs, 0)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">Completed</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">{toInt(payload.autopass_done, 0)}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700">Lock Busy</div>
          <div className="mt-2 text-2xl font-semibold text-amber-900">{toInt(payload.lock_busy_total, 0)}</div>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Queue mode: {toText(payload.mode || "derived")} · Average duration reference: {formatDurationSeconds(payload.avg_duration_s)}
      </div>
    </ChartCard>
  );
}

