import { useEffect, useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import OrgsSummaryRow from "../components/orgs/OrgsSummaryRow";
import OrgsTable from "../components/orgs/OrgsTable";
import AdminOrgInvitesPanel from "../components/orgs/AdminOrgInvitesPanel";
import AdminUsersPanel from "../components/orgs/AdminUsersPanel";
import { ru } from "../../../shared/i18n/ru";
import { apiCreateOrg, apiPatchOrg } from "../../../lib/api";

function CreateOrgPanel({ activeOrgRole, isAdmin = false, onCreated }) {
  const canCreate = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!canCreate) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const orgName = name.trim();
    if (!orgName) { setError("Введите название организации"); return; }
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await apiCreateOrg(orgName);
    setBusy(false);
    if (!res.ok) {
      setError(String(res.error || "Не удалось создать организацию"));
      return;
    }
    setName("");
    setSuccess(`Организация «${orgName}» создана.`);
    onCreated?.();
  }

  return (
    <SectionCard eyebrow="Организации" title="Создать организацию" subtitle="Создание новой организации. Текущий пользователь автоматически становится org_owner.">
      <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
        <div className="flex-1 min-w-[200px]">
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Название организации
          </label>
          <input
            className="input w-full"
            type="text"
            placeholder="Название новой организации"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            disabled={busy}
            required
          />
        </div>
        <button type="submit" className="primaryBtn h-10 min-h-0 px-4 py-0 text-sm" disabled={busy || !name.trim()}>
          {busy ? "Создание…" : "Создать"}
        </button>
        {error ? <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      </form>
    </SectionCard>
  );
}

function ActiveOrgPanel({ activeOrgId, activeOrgName, activeOrgRole, isAdmin = false, onSaved }) {
  const canEdit = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
  const [name, setName] = useState(activeOrgName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setName(activeOrgName || "");
    setError("");
    setSuccess("");
  }, [activeOrgId, activeOrgName]);

  if (!canEdit || !String(activeOrgId || "").trim()) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const nextName = String(name || "").trim();
    if (!nextName) {
      setError("Введите название организации");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await apiPatchOrg(activeOrgId, { name: nextName });
    setBusy(false);
    if (!res.ok) {
      setError(String(res.error || "Не удалось обновить организацию"));
      return;
    }
    setSuccess("Название организации обновлено.");
    onSaved?.();
  }

  return (
    <SectionCard eyebrow="Организация" title="Активная организация" subtitle="Переименование текущей active organization в admin-контуре.">
      <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
        <div className="flex-1 min-w-[200px]">
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Название организации
          </label>
          <input
            className="input w-full"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            disabled={busy}
            required
          />
        </div>
        <button type="submit" className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm" disabled={busy || !String(name || "").trim()}>
          {busy ? "Сохранение…" : "Сохранить"}
        </button>
        {error ? <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      </form>
    </SectionCard>
  );
}

export default function AdminOrgsPage({
  payload = {},
  activeOrgId = "",
  activeOrgName = "",
  activeOrgRole = "",
  isAdmin = false,
  onRefresh,
  recentInvite = null,
  onInviteCreated,
}) {
  return (
    <AdminPageContainer
      summary={<OrgsSummaryRow items={payload?.items || []} activeOrgId={activeOrgId || payload?.active_org_id} />}
      secondary={(
        <SectionCard
          title={ru.admin.orgsPage.notesTitle}
          subtitle={ru.admin.orgsPage.notesSubtitle}
          eyebrow={ru.admin.orgsPage.notesEyebrow}
        >
          <div className="text-sm text-slate-500">
            {ru.admin.orgsPage.notesBody}
          </div>
        </SectionCard>
      )}
    >
      <AdminFiltersBar title={ru.admin.orgsPage.filtersTitle} subtitle={ru.admin.orgsPage.filtersSubtitle} />
      <CreateOrgPanel
        activeOrgRole={activeOrgRole}
        isAdmin={isAdmin}
        onCreated={onRefresh}
      />
      <ActiveOrgPanel
        activeOrgId={activeOrgId || payload?.active_org_id}
        activeOrgName={activeOrgName}
        activeOrgRole={activeOrgRole}
        isAdmin={isAdmin}
        onSaved={onRefresh}
      />
      <AdminUsersPanel
        isAdmin={isAdmin}
        activeOrgId={activeOrgId || payload?.active_org_id}
        orgOptions={payload?.items || []}
      />
      <AdminOrgInvitesPanel
        items={payload?.items || []}
        activeOrgId={activeOrgId || payload?.active_org_id}
        activeOrgName={activeOrgName}
        activeOrgRole={activeOrgRole}
        isAdmin={isAdmin}
        onChanged={onRefresh}
        recentInvite={recentInvite}
        onInviteCreated={onInviteCreated}
      />
      <OrgsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}
