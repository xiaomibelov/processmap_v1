import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatRoleWithScope } from "../../adminRoles";
import { asArray, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function OrgsTable({
  items = [],
  selectedOrgId = "",
  onSelect,
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.orgsPage.table.title} subtitle={ru.admin.orgsPage.table.subtitle} eyebrow={ru.admin.orgsPage.table.eyebrow}>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-2.5 py-2 font-medium">{ru.admin.orgsPage.table.org}</th>
              <th className="px-2.5 py-2 font-medium">{ru.admin.orgsPage.table.role}</th>
              <th className="px-2.5 py-2 font-medium">{ru.admin.orgsPage.table.members}</th>
              <th className="px-2.5 py-2 font-medium">{ru.admin.orgsPage.table.projects}</th>
              <th className="px-2.5 py-2 font-medium">{ru.admin.orgsPage.table.activeSessions}</th>
              <th className="px-2.5 py-2 font-medium">{ru.admin.orgsPage.table.pendingInvites}</th>
              <th className="px-2.5 py-2 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-2.5 py-5 text-slate-500" colSpan={7}>{ru.admin.orgsPage.table.noData}</td>
              </tr>
            ) : null}
            {rows.map((row, idx) => {
              const orgId = toText(row?.org_id || row?.id);
              const isSelected = orgId && orgId === toText(selectedOrgId);
              const isActive = row?.is_active_context === true;
              return (
                <tr
                  key={`${orgId}_${idx}`}
                  onClick={() => onSelect?.(row)}
                  className={`cursor-pointer border-t border-slate-100 transition ${isSelected ? "bg-emerald-50/60" : "hover:bg-slate-50"}`}
                >
                  <td className="px-2.5 py-2 font-medium text-slate-950">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${isSelected ? "bg-emerald-500" : "bg-slate-300"}`} />
                      {toText(row?.name || row?.org_name || row?.org_id || row?.id)}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-slate-600">{formatRoleWithScope(row?.role, { isAdmin: toText(row?.role) === "platform_admin" })}</td>
                  <td className="px-2.5 py-2 text-slate-700">{Number(row?.members_count || 0)}</td>
                  <td className="px-2.5 py-2 text-slate-700">{Number(row?.projects_count || 0)}</td>
                  <td className="px-2.5 py-2 text-slate-700">{Number(row?.active_sessions_count || 0)}</td>
                  <td className="px-2.5 py-2 text-slate-700">{Number(row?.pending_invites_count || 0)}</td>
                  <td className="px-2.5 py-2">
                    {isActive ? <StatusPill status="Текущая" tone="accent" compact /> : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
