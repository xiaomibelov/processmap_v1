import KpiCard from "../common/KpiCard";
import { formatLatencyMs, formatPct, toInt, toText } from "../../utils/adminFormat";

export default function DashboardKpiRow({
  kpis = {},
}) {
  const redisMode = toText(kpis.redis_mode || "UNKNOWN");
  const redisModeLower = redisMode.toLowerCase();
  const redisTone = (
    redisModeLower === "error" || redisModeLower === "incident" || redisModeLower === "misconfigured"
      ? "danger"
      : redisModeLower === "fallback" || redisModeLower === "off" || redisModeLower === "degraded"
        ? "warn"
        : "accent"
  );
  const redisHint = (
    redisModeLower === "on"
      ? "Primary Redis performance path active"
      : redisModeLower === "fallback"
        ? "Degraded fallback mode: Redis unavailable"
        : redisModeLower === "error"
          ? "Incident: Redis misconfigured/unreachable"
          : "Redis runtime status"
  );
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
      <KpiCard title="Organizations" value={toInt(kpis.organizations, 0)} hint="Accessible org contours" />
      <KpiCard title="Projects" value={toInt(kpis.projects, 0)} hint="Projects in current scope" />
      <KpiCard title="Active Sessions" value={toInt(kpis.active_sessions, 0)} hint="Sessions in progress" tone="accent" />
      <KpiCard title="AutoPass Success" value={formatPct(kpis.autopass_success_rate_pct)} hint="Successful completed runs" />
      <KpiCard title="Failed Jobs" value={toInt(kpis.failed_jobs, 0)} hint="AutoPass/report failures" tone="danger" />
      <KpiCard title="Template Usage" value={toInt(kpis.template_usage, 0)} hint="Applied or stored templates" />
      <KpiCard title="Avg Save Latency" value={formatLatencyMs(kpis.avg_save_latency_ms)} hint="Average save latency" />
      <KpiCard title="Redis Mode" value={redisMode} hint={redisHint} tone={redisTone} />
    </div>
  );
}
