import KpiCard from "../common/KpiCard";
import { toInt } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function AuditSummaryRow({
  summary = {},
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard title={ru.admin.auditPage.summary.totalEvents} value={toInt(summary?.total, 0)} hint={ru.admin.auditPage.summary.totalEventsHint} />
      <KpiCard title="OK" value={toInt(summary?.ok, 0)} hint={ru.admin.auditPage.summary.okHint} tone="accent" />
      <KpiCard title={ru.admin.auditPage.summary.failed} value={toInt(summary?.failed, 0)} hint={ru.admin.auditPage.summary.failedHint} tone="danger" />
      <KpiCard title={ru.admin.auditPage.summary.uniqueActors} value={toInt(summary?.unique_actors, 0)} hint={ru.admin.auditPage.summary.uniqueActorsHint} />
    </div>
  );
}
