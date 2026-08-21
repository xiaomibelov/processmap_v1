import ChartCard from "../common/ChartCard";
import StatusPill from "../common/StatusPill";
import { formatPct, toInt } from "../../utils/adminFormat";

export default function AutoPassOutcomesWidget({
  payload = {},
  onNavigate,
}) {
  return (
    <ChartCard
      title="AutoPass Outcomes"
      subtitle="Completed runs must end at the main process EndEvent"
      eyebrow="Quality Gate"
      action={(
        <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.("/admin/jobs")}>
          Open Jobs
        </button>
      )}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Runs</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{toInt(payload.runs, 0)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Success Rate</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{formatPct(payload.success_rate_pct)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-emerald-700">Done</div>
            <StatusPill status="done" tone="ok" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">{toInt(payload.done, 0)}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-rose-700">Failed</div>
            <StatusPill status="failed" tone="danger" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-rose-900">{toInt(payload.failed, 0)}</div>
        </div>
      </div>
    </ChartCard>
  );
}

