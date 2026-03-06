import KpiCard from "../common/KpiCard";
import { toInt } from "../../utils/adminFormat";

export default function AuditSummaryRow({
  summary = {},
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard title="Total Events" value={toInt(summary?.total, 0)} hint="Rows returned by current filters" />
      <KpiCard title="OK" value={toInt(summary?.ok, 0)} hint="Successful events" tone="accent" />
      <KpiCard title="Failed" value={toInt(summary?.failed, 0)} hint="Failure events" tone="danger" />
      <KpiCard title="Unique Actors" value={toInt(summary?.unique_actors, 0)} hint="Distinct users in filtered audit set" />
    </div>
  );
}

