import KpiCard from "../common/KpiCard";
import { asArray, sumBy } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function ProjectsSummaryRow({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard title={ru.admin.projectsPage.summary.projects} value={rows.length} hint={ru.admin.projectsPage.summary.projectsHint} />
      <KpiCard title={ru.admin.projectsPage.summary.sessions} value={sumBy(rows, (row) => row?.session_count)} hint={ru.admin.projectsPage.summary.sessionsHint} tone="accent" />
      <KpiCard title={ru.admin.projectsPage.summary.templates} value="—" hint={ru.admin.projectsPage.summary.templatesHint} />
      <KpiCard title={ru.admin.projectsPage.summary.reportsHealth} value={ru.admin.projectsPage.summary.reportsHealthValue} hint={ru.admin.projectsPage.summary.reportsHealthHint} />
    </div>
  );
}
