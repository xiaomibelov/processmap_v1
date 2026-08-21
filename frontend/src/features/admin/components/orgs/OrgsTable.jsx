import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatRoleWithScope } from "../../adminRoles";
import { asArray, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function OrgsTable({
  items = [],
  expandedOrgId = "",
  onToggleExpand,
  renderExpanded,
}) {
  const rows = asArray(items);
  return (
    <SectionCard title={ru.admin.orgsPage.table.title} subtitle={ru.admin.orgsPage.table.subtitle} eyebrow={ru.admin.orgsPage.table.eyebrow}>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium"></th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.org}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.role}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.members}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.projects}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.activeSessions}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.pendingInvites}</th>
              <th className="px-2 py-1.5 font-medium">{ru.admin.orgsPage.table.health}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-slate-100">
                <td className="px-2 py-5 text-slate-500" colSpan={8}>{ru.admin.orgsPage.table.noData}</td>
              </tr>
            ) : null}
            {rows.map((row, idx) => {
              const orgId = toText(row?.org_id || row?.id);
              const isExpanded = orgId && orgId === toText(expandedOrgId);
              const isActive = row?.is_active_context === true;
              const orgActive = row?.is_active !== false;
              return (
                <>
                  <tr
                    key={`${orgId}_${idx}`}
                    className={`cursor-pointer border-t border-slate-100 transition ${isExpanded ? "bg-emerald-50/60" : "hover:bg-slate-50"} ${orgActive ? "" : "bg-slate-50/50 text-slate-400"}`}
                    onClick={() => onToggleExpand?.(orgId)}
                  >
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="secondaryBtn h-6 min-h-0 rounded-lg px-1.5 py-0 text-[10px]"
                        onClick={(e) => { e.stopPropagation(); onToggleExpand?.(orgId); }}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    </td>
                    <td className={`px-2 py-2 font-medium ${orgActive ? "text-slate-950" : "text-slate-400 line-through"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {toText(row?.name || row?.org_name || orgId)}
                        {!orgActive ? <StatusPill status="Inactive" tone="default" compact /> : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{formatRoleWithScope(row?.role, { isAdmin: toText(row?.role) === "platform_admin" })}</td>
                    <td className="px-2 py-2 text-slate-700">{Number(row?.members_count || 0)}</td>
                    <td className="px-2 py-2 text-slate-700">{Number(row?.projects_count || 0)}</td>
                    <td className="px-2 py-2 text-slate-700">{Number(row?.active_sessions_count || 0)}</td>
                    <td className="px-2 py-2 text-slate-700">{Number(row?.pending_invites_count || 0)}</td>
                    <td className="px-2 py-2">
                      {isActive ? <StatusPill status={ru.admin.orgsPage.table.currentOrg} tone="accent" compact /> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`${orgId}_detail`} className="border-t border-slate-100 bg-slate-50/70">
                      <td colSpan={8} className="px-2 py-2">
                        {renderExpanded?.(row)}
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
