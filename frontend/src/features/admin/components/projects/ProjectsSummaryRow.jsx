import KpiCard from "../common/KpiCard";
import { asArray, sumBy } from "../../utils/adminFormat";

export default function ProjectsSummaryRow({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard title="Projects" value={rows.length} hint="Projects in current org scope" />
      <KpiCard title="Sessions" value={sumBy(rows, (row) => row?.session_count)} hint="Total sessions across projects" tone="accent" />
      <KpiCard title="Templates Used" value="—" hint="Awaiting per-project template attribution" />
      <KpiCard title="Reports Health" value="Scoped" hint="Report/doc health is tracked at session level" />
    </div>
  );
}

