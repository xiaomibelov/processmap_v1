import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatRoleWithScope } from "../../adminRoles";
import { asArray, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function OrgsTable({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.orgsPage.table.title} subtitle={ru.admin.orgsPage.table.subtitle} eyebrow={ru.admin.orgsPage.table.eyebrow}>
      <div className="overflow-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-3 py-3">{ru.admin.orgsPage.table.org}</th>
              <th className="px-3 py-3">{ru.admin.orgsPage.table.role}</th>
              <th className="px-3 py-3">{ru.admin.orgsPage.table.members}</th>
              <th className="px-3 py-3">{ru.admin.orgsPage.table.projects}</th>
              <th className="px-3 py-3">{ru.admin.orgsPage.table.activeSessions}</th>
              <th className="px-3 py-3">{ru.admin.orgsPage.table.pendingInvites}</th>
              <th className="px-3 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-3 py-5 text-slate-500" colSpan={7}>{ru.admin.orgsPage.table.noData}</td>
              </tr>
            ) : null}
            {rows.map((row, idx) => (
              <tr key={`${toText(row?.org_id || row?.id)}_${idx}`} className="border-t border-slate-100">
                <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.name || row?.org_name || row?.org_id || row?.id)}</td>
                <td className="px-3 py-3 text-slate-600">{formatRoleWithScope(row?.role, { isAdmin: toText(row?.role) === "platform_admin" })}</td>
                <td className="px-3 py-3 text-slate-700">{Number(row?.members_count || 0)}</td>
                <td className="px-3 py-3 text-slate-700">{Number(row?.projects_count || 0)}</td>
                <td className="px-3 py-3 text-slate-700">{Number(row?.active_sessions_count || 0)}</td>
                <td className="px-3 py-3 text-slate-700">{Number(row?.pending_invites_count || 0)}</td>
                <td className="px-3 py-3">
                  {row?.is_active_context ? <StatusPill status="Текущая" tone="accent" /> : <span className="text-slate-500">Переключение через верхнюю панель</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
