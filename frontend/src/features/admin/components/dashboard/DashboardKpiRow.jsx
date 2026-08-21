import KpiCard from "../common/KpiCard";
import { formatLatencyMs, formatPct, toInt } from "../../utils/adminFormat";

export default function DashboardKpiRow({
  kpis = {},
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
      <KpiCard title="Organizations" value={toInt(kpis.organizations, 0)} hint="Accessible org contours" />
      <KpiCard title="Projects" value={toInt(kpis.projects, 0)} hint="Projects in current scope" />
      <KpiCard title="Active Sessions" value={toInt(kpis.active_sessions, 0)} hint="Sessions in progress" tone="accent" />
      <KpiCard title="AutoPass Success" value={formatPct(kpis.autopass_success_rate_pct)} hint="Successful completed runs" />
      <KpiCard title="Failed Jobs" value={toInt(kpis.failed_jobs, 0)} hint="AutoPass/report failures" tone="danger" />
      <KpiCard title="Avg Save Latency" value={formatLatencyMs(kpis.avg_save_latency_ms)} hint="Average save latency" />
      <KpiCard title="Published BPMN Versions" value={toInt(kpis.published_bpmn_versions, 0)} hint="Publish-time immutable BPMN versions" />
      <KpiCard title="Mirrored to Git" value={toInt(kpis.mirrored_to_git, 0)} hint="Latest publish states with successful Git sync" tone="accent" />
    </div>
  );
}
