import { useMemo, useState } from "react";
import { apiCreateOrg } from "../../../../lib/api";
import SectionCard from "../common/SectionCard";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import { toText } from "../../utils/adminFormat";
import OrgsTable from "./OrgsTable";
import OrgDetailTabs from "./OrgDetailTabs";

function CreateOrgCard({ activeOrgRole, isAdmin = false, onCreated }) {
  const canCreate = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const createOrgMutation = useAdminMutation({
    mutationFn: async (orgName) => {
      const res = await apiCreateOrg(orgName);
      if (!res.ok) throw new Error(res.error || "Не удалось создать организацию");
      return res;
    },
    invalidateKeys: [["adminOrgs"]],
    onSuccess: (_, orgName) => {
      setName("");
      setError("");
      setSuccess(`Организация «${orgName}» создана.`);
      onCreated?.();
    },
    onError: (err) => {
      setError(String(err.message || "Не удалось создать организацию"));
      setSuccess("");
    },
  });

  if (!canCreate) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const orgName = name.trim();
    if (!orgName) { setError("Введите название организации"); return; }
    setError("");
    setSuccess("");
    await createOrgMutation.mutateAsync(orgName);
  }

  return (
    <SectionCard eyebrow="Организации" title="Создать организацию" subtitle="Новая организация появится в общем списке; текущий пользователь станет org_owner.">
      <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit}>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Название организации</label>
          <input
            className="input h-8 min-h-0 w-full py-1 text-xs"
            type="text"
            placeholder="Название новой организации"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            disabled={createOrgMutation.isPending}
            required
          />
        </div>
        <button type="submit" className="primaryBtn h-8 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={createOrgMutation.isPending || !name.trim()}>
          {createOrgMutation.isPending ? "Создание…" : "Создать"}
        </button>
      </form>
      {error ? <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
      {success ? <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div> : null}
    </SectionCard>
  );
}

export default function AdminOrgsPanel({
  items = [],
  activeOrgId = "",
  activeOrgRole = "",
  isAdmin = false,
  onRefresh,
}) {
  const rows = items || [];
  const [expandedOrgId, setExpandedOrgId] = useState(() => {
    const active = rows.find((r) => toText(r?.org_id || r?.id) === toText(activeOrgId));
    return active ? toText(activeOrgId) : "";
  });

  function handleToggleExpand(orgId) {
    setExpandedOrgId((current) => (toText(current) === toText(orgId) ? "" : toText(orgId)));
  }

  const expandedOrg = useMemo(() => {
    return rows.find((r) => toText(r?.org_id || r?.id) === toText(expandedOrgId)) || null;
  }, [rows, expandedOrgId]);

  return (
    <div id="admin-access-orgs" className="space-y-3">
      <CreateOrgCard activeOrgRole={activeOrgRole} isAdmin={isAdmin} onCreated={onRefresh} />
      <OrgsTable
        items={rows}
        expandedOrgId={expandedOrgId}
        onToggleExpand={handleToggleExpand}
        renderExpanded={(row) => (
          <OrgDetailTabs
            org={row}
            activeOrgId={activeOrgId}
            activeOrgRole={activeOrgRole}
            isAdmin={isAdmin}
            onSaved={onRefresh}
          />
        )}
      />
      {!expandedOrg && rows.length > 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Выберите организацию в таблице, чтобы увидеть детали.
        </div>
      ) : null}
    </div>
  );
}
