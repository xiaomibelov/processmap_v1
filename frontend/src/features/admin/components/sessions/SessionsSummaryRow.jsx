import KpiCard from "../common/KpiCard";
import { asArray, toInt, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

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
      <KpiCard title={ru.admin.sessionsPage.summary.totalSessions} value={rows.length} hint={ru.admin.sessionsPage.summary.totalSessionsHint} />
      <KpiCard title={ru.admin.sessionsPage.summary.active} value={active} hint={ru.admin.sessionsPage.summary.activeHint} tone="accent" />
      <KpiCard title={ru.admin.sessionsPage.summary.autopassFailed} value={autopassFailed} hint={ru.admin.sessionsPage.summary.autopassFailedHint} tone="danger" />
      <KpiCard title={ru.admin.sessionsPage.summary.warningsErrors} value={`${warnings} / ${errors}`} hint={ru.admin.sessionsPage.summary.warningsErrorsHint} />
      <KpiCard title={ru.admin.sessionsPage.summary.redisFallback} value={redisFallback} hint={ru.admin.sessionsPage.summary.redisFallbackHint} tone={redisFallback > 0 ? "warn" : "default"} />
      <KpiCard title={ru.admin.sessionsPage.summary.redisIncidents} value={redisIncident} hint={ru.admin.sessionsPage.summary.redisIncidentsHint} tone={redisIncident > 0 ? "danger" : "default"} />
    </div>
  );
}
