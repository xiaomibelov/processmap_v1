import { useEffect, useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import OrgsSummaryRow from "../components/orgs/OrgsSummaryRow";
import OrgsTable from "../components/orgs/OrgsTable";
import AdminOrgInvitesPanel from "../components/orgs/AdminOrgInvitesPanel";
import AdminUsersPanel from "../components/orgs/AdminUsersPanel";
import { ru } from "../../../shared/i18n/ru";
import {
  apiCreateOrg,
  apiGetOrgGitMirrorConfig,
  apiPatchOrg,
  apiPatchOrgGitMirrorConfig,
} from "../../../lib/api";

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

function GitMirrorPanel({ activeOrgId = "", activeOrgRole = "", isAdmin = false, onSaved }) {
  const oid = String(activeOrgId || "").trim();
  const canManage = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [basePath, setBasePath] = useState("");
  const [healthStatus, setHealthStatus] = useState("unknown");
  const [healthMessage, setHealthMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const [updatedBy, setUpdatedBy] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      if (!oid) return;
      setLoading(true);
      setError("");
      const res = await apiGetOrgGitMirrorConfig(oid);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(String(res.error || "Не удалось загрузить конфигурацию Git mirror."));
        return;
      }
      const cfg = res.config || {};
      setEnabled(cfg.git_mirror_enabled === true);
      setProvider(String(cfg.git_provider || ""));
      setRepository(String(cfg.git_repository || ""));
      setBranch(String(cfg.git_branch || ""));
      setBasePath(String(cfg.git_base_path || ""));
      setHealthStatus(String(cfg.git_health_status || "unknown"));
      setHealthMessage(String(cfg.git_health_message || ""));
      setUpdatedAt(Number(cfg.git_updated_at || 0));
      setUpdatedBy(String(cfg.git_updated_by || ""));
    }
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [oid]);

  function healthTone(statusRaw) {
    const status = String(statusRaw || "").toLowerCase();
    if (status === "valid") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (status === "invalid") return "text-rose-700 bg-rose-50 border-rose-200";
    return "text-slate-600 bg-slate-50 border-slate-200";
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!oid || !canManage) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await apiPatchOrgGitMirrorConfig(oid, {
      git_mirror_enabled: enabled,
      git_provider: provider || null,
      git_repository: repository || null,
      git_branch: branch || null,
      git_base_path: basePath || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(String(res.error || "Не удалось сохранить конфигурацию Git mirror."));
      return;
    }
    const cfg = res.config || {};
    setEnabled(cfg.git_mirror_enabled === true);
    setProvider(String(cfg.git_provider || ""));
    setRepository(String(cfg.git_repository || ""));
    setBranch(String(cfg.git_branch || ""));
    setBasePath(String(cfg.git_base_path || ""));
    setHealthStatus(String(cfg.git_health_status || "unknown"));
    setHealthMessage(String(cfg.git_health_message || ""));
    setUpdatedAt(Number(cfg.git_updated_at || 0));
    setUpdatedBy(String(cfg.git_updated_by || ""));
    setSuccess("Конфигурация Git mirror сохранена.");
    onSaved?.();
  }

  const targetParts = [
    provider ? provider : "provider: —",
    repository ? repository : "repo/project: —",
    branch ? `branch: ${branch}` : "branch: —",
    basePath ? `base path: ${basePath}` : "base path: —",
  ];

  return (
    <SectionCard
      eyebrow="Git mirror"
      title="Git mirror"
      subtitle="Publish-only mirror на уровне организации: provider, repository/project, branch, base path."
    >
      {!oid ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Сначала выберите активную организацию.
        </div>
      ) : (
        <form className="space-y-3" onSubmit={handleSave}>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canManage || busy || loading}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable Git mirror
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</div>
              <select
                className="input w-full"
                value={provider}
                disabled={!canManage || busy || loading}
                onChange={(event) => setProvider(event.target.value)}
              >
                <option value="">—</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </label>
            <label>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Repository / Project</div>
              <input
                className="input w-full"
                type="text"
                placeholder="owner/repo или group/subgroup/project"
                value={repository}
                disabled={!canManage || busy || loading}
                onChange={(event) => setRepository(event.target.value)}
              />
            </label>
            <label>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</div>
              <input
                className="input w-full"
                type="text"
                placeholder="main"
                value={branch}
                disabled={!canManage || busy || loading}
                onChange={(event) => setBranch(event.target.value)}
              />
            </label>
            <label>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Base path</div>
              <input
                className="input w-full"
                type="text"
                placeholder="processmap/published"
                value={basePath}
                disabled={!canManage || busy || loading}
                onChange={(event) => setBasePath(event.target.value)}
              />
            </label>
          </div>
          <div className={`rounded-2xl border px-3 py-2 text-sm ${healthTone(healthStatus)}`}>
            <div className="font-medium">Health: {String(healthStatus || "unknown")}</div>
            <div className="mt-1 text-xs">{healthMessage || "Нет диагностического сообщения."}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Effective target: {targetParts.join(" · ")}
            {updatedAt > 0 ? ` · updated at: ${new Date(updatedAt * 1000).toLocaleString("ru-RU")}` : ""}
            {updatedBy ? ` · updated by: ${updatedBy}` : ""}
          </div>
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
          {canManage ? (
            <button type="submit" className="secondaryBtn h-10 min-h-0 px-4 py-0 text-sm" disabled={busy || loading}>
              {busy ? "Сохранение…" : "Сохранить Git mirror"}
            </button>
          ) : (
            <div className="text-xs text-slate-500">Недостаточно прав для изменения настроек Git mirror.</div>
          )}
        </form>
      )}
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
      <GitMirrorPanel
        activeOrgId={activeOrgId || payload?.active_org_id}
        activeOrgRole={activeOrgRole}
        isAdmin={isAdmin}
        onSaved={onRefresh}
      />
      <OrgsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}
