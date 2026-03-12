import KpiCard from "../common/KpiCard";
import { asArray, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function OrgsSummaryRow({
  items = [],
  activeOrgId = "",
}) {
  const rows = asArray(items);
  const adminRoles = rows.filter((row) => ["org_owner", "org_admin", "project_manager", "auditor"].includes(toText(row?.role))).length;
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      <KpiCard title={ru.admin.orgsPage.summary.orgs} value={rows.length} hint={ru.admin.orgsPage.summary.orgsHint} />
      <KpiCard title={ru.admin.orgsPage.summary.elevated} value={adminRoles} hint={ru.admin.orgsPage.summary.elevatedHint} tone="accent" />
      <KpiCard title={ru.admin.orgsPage.summary.activeOrg} value={toText(activeOrgId || "—")} hint={ru.admin.orgsPage.summary.activeOrgHint} />
      <KpiCard title={ru.admin.orgsPage.summary.health} value={ru.admin.orgsPage.summary.healthValue} hint={ru.admin.orgsPage.summary.healthHint} />
    </div>
  );
}
