import KpiCard from "../common/KpiCard";
import { asArray, toText } from "../../utils/adminFormat";

export default function OrgsSummaryRow({
  items = [],
  activeOrgId = "",
}) {
  const rows = asArray(items);
  const adminRoles = rows.filter((row) => ["org_owner", "org_admin", "project_manager", "auditor"].includes(toText(row?.role))).length;
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      <KpiCard title="Organizations" value={rows.length} hint="Memberships visible to current actor" />
      <KpiCard title="Elevated Roles" value={adminRoles} hint="Owner/admin/PM/auditor memberships" tone="accent" />
      <KpiCard title="Active Org" value={toText(activeOrgId || "—")} hint="Current admin context" />
      <KpiCard title="Health" value="Scoped" hint="Per-org operational metrics can be drilled down via dashboard" />
    </div>
  );
}

