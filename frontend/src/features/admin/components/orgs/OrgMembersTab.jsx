import { apiListOrgMembers, apiPatchOrgMember } from "../../../../lib/api";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { formatTs, toText } from "../../utils/adminFormat";
import { ROLE_OPTIONS } from "../users/userAccessConstants";

async function fetchMembers(orgId) {
  const res = await apiListOrgMembers(orgId);
  if (!res.ok) throw new Error(res.error || "Не удалось загрузить участников.");
  return Array.isArray(res.items) ? res.items : [];
}

export default function OrgMembersTab({ orgId = "", canManage = false }) {
  const oid = String(orgId || "").trim();

  const { data: members, isLoading, error: queryError } = useAdminQuery({
    queryKey: ["orgMembers", oid],
    fetcher: () => fetchMembers(oid),
    enabled: Boolean(oid),
  });

  const patchRoleMutation = useAdminMutation({
    mutationFn: async ({ userId, role }) => {
      const res = await apiPatchOrgMember(oid, userId, role);
      if (!res.ok) throw new Error(res.error || "Не удалось обновить роль.");
      return res;
    },
    invalidateKeys: [["orgMembers", oid]],
  });

  const rows = Array.isArray(members) ? members : [];

  if (!oid) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">Сначала выберите организацию.</div>;
  }

  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      {queryError ? <div className="px-3 py-2 text-xs text-rose-700">{queryError.message}</div> : null}
      {isLoading ? <div className="px-3 py-2 text-xs text-slate-500">Загрузка…</div> : null}
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-2 py-1.5 font-medium">Пользователь</th>
            <th className="px-2 py-1.5 font-medium">Email</th>
            <th className="px-2 py-1.5 font-medium">Роль</th>
            <th className="px-2 py-1.5 font-medium">В организации</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-2 py-4 text-slate-500" colSpan={4}>Участники не найдены.</td>
            </tr>
          ) : null}
          {rows.map((row, idx) => {
            const userId = toText(row?.user_id || row?.id);
            const role = toText(row?.role);
            return (
              <tr key={`${userId}_${idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.full_name) || toText(row?.name) || "—"}</td>
                <td className="px-2 py-2 text-slate-600">{toText(row?.email) || "—"}</td>
                <td className="px-2 py-2">
                  {canManage ? (
                    <select
                      className="input h-7 min-h-0 w-full py-0.5 text-xs"
                      value={role || "org_viewer"}
                      disabled={patchRoleMutation.isPending}
                      onChange={(e) => patchRoleMutation.mutate({ userId, role: e.target.value })}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-600">{ROLE_OPTIONS.find((o) => o.value === role)?.label || role || "—"}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-slate-500">{formatTs(row?.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
