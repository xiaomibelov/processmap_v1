import KpiCard from "../common/KpiCard";
import { asArray, toInt, toText } from "../../utils/adminFormat";

export default function SessionsSummaryRow({
  items = [],
}) {
  const rows = asArray(items);
  const active = rows.filter((row) => toText(row?.status) === "in_progress").length;
  const autopassFailed = rows.filter((row) => toText(row?.autopass_status).toLowerCase() === "failed").length;
  const warnings = rows.reduce((acc, row) => acc + toInt(row?.warnings_count, 0), 0);
  const errors = rows.reduce((acc, row) => acc + toInt(row?.errors_count, 0), 0);
  const redisFallback = rows.filter((row) => toText(row?.redis_mode).toLowerCase() === "fallback").length;
  const redisIncident = rows.filter((row) => toText(row?.redis_mode).toLowerCase() === "error").length;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <KpiCard title="Total Sessions" value={rows.length} hint="Sessions in current admin scope" />
      <KpiCard title="Active" value={active} hint="In progress right now" tone="accent" />
      <KpiCard title="AutoPass Failed" value={autopassFailed} hint="Failed latest AutoPass run" tone="danger" />
      <KpiCard title="Warnings / Errors" value={`${warnings} / ${errors}`} hint="Aggregate warning pressure" />
      <KpiCard title="Redis Fallback" value={redisFallback} hint="Degraded fallback sessions" tone={redisFallback > 0 ? "warn" : "default"} />
      <KpiCard title="Redis Incidents" value={redisIncident} hint="Redis config/connectivity incident markers" tone={redisIncident > 0 ? "danger" : "default"} />
    </div>
  );
}
