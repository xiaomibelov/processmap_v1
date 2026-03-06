import KpiCard from "../common/KpiCard";
import { formatDurationSeconds, toInt } from "../../utils/adminFormat";

export default function JobsSummaryRow({
  summary = {},
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard title="Total Jobs" value={toInt(summary?.total, 0)} hint="Jobs visible in admin scope" />
      <KpiCard title="Queued / Running" value={`${toInt(summary?.queued, 0)} / ${toInt(summary?.running, 0)}`} hint="Queue pressure" tone="accent" />
      <KpiCard title="Completed" value={toInt(summary?.completed, 0)} hint="Completed successfully" />
      <KpiCard title="Failed" value={toInt(summary?.failed, 0)} hint="Jobs with latest failure" tone="danger" />
      <KpiCard title="Avg Duration" value={formatDurationSeconds(summary?.avg_duration_s)} hint="Average observed duration" />
    </div>
  );
}

