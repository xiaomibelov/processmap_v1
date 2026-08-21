import KpiCard from "../common/KpiCard";
import { formatDurationSeconds, toInt } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function JobsSummaryRow({
  summary = {},
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <KpiCard title={ru.admin.jobsPage.summary.totalJobs} value={toInt(summary?.total, 0)} hint={ru.admin.jobsPage.summary.totalJobsHint} />
      <KpiCard title={ru.admin.jobsPage.summary.queuedRunning} value={`${toInt(summary?.queued, 0)} / ${toInt(summary?.running, 0)}`} hint={ru.admin.jobsPage.summary.queuedRunningHint} tone="accent" />
      <KpiCard title={ru.admin.jobsPage.summary.completed} value={toInt(summary?.completed, 0)} hint={ru.admin.jobsPage.summary.completedHint} />
      <KpiCard title={ru.admin.jobsPage.summary.failed} value={toInt(summary?.failed, 0)} hint={ru.admin.jobsPage.summary.failedHint} tone="danger" />
      <KpiCard title={ru.admin.jobsPage.summary.avgDuration} value={formatDurationSeconds(summary?.avg_duration_s)} hint={ru.admin.jobsPage.summary.avgDurationHint} />
    </div>
  );
}
