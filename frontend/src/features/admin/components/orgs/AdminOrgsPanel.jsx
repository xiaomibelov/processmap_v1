import { useMemo, useState } from "react";
import { apiCreateOrg } from "../../../../lib/api";
import SectionCard from "../common/SectionCard";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import OrgsTable from "./OrgsTable";
import AdminOrgDetailPanel from "./AdminOrgDetailPanel";
import { toText } from "../../utils/adminFormat";

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
      setSuccess(`Организация «${orgName}» создана.`);
      onCreated?.();
    },
    onError: (err) => setError(String(err.message || "Не удалось создать организацию")),
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
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Название организации
          </label>
          <input
            className="input h-9 min-h-0 w-full py-1.5 text-sm"
            type="text"
            placeholder="Название новой организации"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            disabled={createOrgMutation.isPending}
            required
          />
        </div>
        <button type="submit" className="primaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={createOrgMutation.isPending || !name.trim()}>
          {createOrgMutation.isPending ? "Создание…" : "Создать"}
        </button>
        {error ? <div className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      </form>
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
  const [selectedOrgId, setSelectedOrgId] = useState(() => {
    const active = rows.find((r) => toText(r?.org_id || r?.id) === toText(activeOrgId));
    return active ? toText(activeOrgId) : "";
  });

  const selectedOrg = useMemo(() => {
    return rows.find((r) => toText(r?.org_id || r?.id) === toText(selectedOrgId)) || null;
  }, [rows, selectedOrgId]);

  return (
    <div id="admin-access-orgs" className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <CreateOrgCard activeOrgRole={activeOrgRole} isAdmin={isAdmin} onCreated={onRefresh} />
          <OrgsTable items={rows} selectedOrgId={selectedOrgId} onSelect={(row) => setSelectedOrgId(toText(row?.org_id || row?.id))} />
        </div>
        <div className="lg:col-span-1">
          <AdminOrgDetailPanel
            org={selectedOrg}
            activeOrgId={activeOrgId}
            activeOrgRole={activeOrgRole}
            isAdmin={isAdmin}
            onSaved={onRefresh}
          />
        </div>
      </div>
    </div>
  );
}
