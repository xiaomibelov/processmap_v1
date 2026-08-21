import { asArray, toText } from "../../utils/adminFormat";
import { formatRoleWithScope } from "../../adminRoles";
import { ru } from "../../../../shared/i18n/ru";

export default function OrgsSummaryRow({
  items = [],
  activeOrgId = "",
  activeOrgName = "",
  activeOrgRole = "",
  isAdmin = false,
}) {
  const rows = asArray(items);
  const adminRoles = rows.filter((row) => ["org_owner", "org_admin", "project_manager", "auditor"].includes(toText(row?.role))).length;
  const activeOrgLabel = toText(activeOrgName || activeOrgId) || "—";
  const roleLabel = formatRoleWithScope(activeOrgRole, { isAdmin });
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="min-w-0 md:col-span-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{ru.admin.orgsPage.summary.activeOrg}</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-slate-950">{activeOrgLabel}</div>
          <div className="text-xs text-slate-500">{roleLabel || ru.admin.orgsPage.summary.activeOrgHint}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{ru.admin.orgsPage.summary.orgs}</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-950">{rows.length}</div>
          <div className="text-xs text-slate-500">{ru.admin.orgsPage.summary.orgsHint}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{ru.admin.orgsPage.summary.elevated}</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-950">{adminRoles}</div>
          <div className="text-xs text-slate-500">{ru.admin.orgsPage.summary.elevatedHint}</div>
        </div>
      </div>
    </div>
  );
}
