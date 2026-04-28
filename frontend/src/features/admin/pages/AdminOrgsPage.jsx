import { useEffect, useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
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

function SectionIntro({ id, eyebrow, title, subtitle, children = null }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
          {subtitle ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function SystemStatusPanel() {
  return (
    <details id="admin-access-system" className="scroll-mt-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        Системное состояние и служебные заметки
      </summary>
      <div className="mt-3 space-y-2 text-sm text-slate-500">
        <p>{ru.admin.orgsPage.notesBody}</p>
        <p>Redis и runtime health остаются в операционной сводке; на этой странице они не конкурируют с управлением пользователями и доступом.</p>
      </div>
    </details>
  );
}

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
    <SectionCard eyebrow="Организации" title="Создать организацию" subtitle="Новая организация появится в общем списке; текущий пользователь станет org_owner.">
      <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit}>
        <div className="flex-1 min-w-[200px]">
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Название организации
          </label>
          <input
            className="input h-9 min-h-0 w-full py-1.5 text-sm"
            type="text"
            placeholder="Название новой организации"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            disabled={busy}
            required
          />
        </div>
        <button type="submit" className="primaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={busy || !name.trim()}>
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
    <SectionCard eyebrow="Организация" title="Переименовать активную организацию" subtitle="Изменяет название текущей организации без изменения ролей и доступов.">
      <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit}>
        <div className="flex-1 min-w-[200px]">
          <label className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Название организации
          </label>
          <input
            className="input h-9 min-h-0 w-full py-1.5 text-sm"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); setSuccess(""); }}
            disabled={busy}
            required
          />
        </div>
        <button type="submit" className="secondaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={busy || !String(name || "").trim()}>
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
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Техническая публикация</div>
        <h3 className="mt-1 text-sm font-semibold text-slate-950">Git mirror / публикация</h3>
        <p className="mt-1 text-xs text-slate-500">Настройки publish-only mirror для активной организации. Поведение сохранения не меняется.</p>
      </div>
      {!oid ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
          Сначала выберите активную организацию.
        </div>
      ) : (
        <form className="space-y-2.5" onSubmit={handleSave}>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canManage || busy || loading}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Включить Git mirror
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            <label>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</div>
              <select
                className="input h-9 min-h-0 w-full py-1.5 text-sm"
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
                className="input h-9 min-h-0 w-full py-1.5 text-sm"
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
                className="input h-9 min-h-0 w-full py-1.5 text-sm"
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
                className="input h-9 min-h-0 w-full py-1.5 text-sm"
                type="text"
                placeholder="processmap/published"
                value={basePath}
                disabled={!canManage || busy || loading}
                onChange={(event) => setBasePath(event.target.value)}
              />
            </label>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-sm ${healthTone(healthStatus)}`}>
            <div className="font-medium">Статус: {String(healthStatus || "unknown")}</div>
            <div className="mt-1 text-xs">{healthMessage || "Нет диагностического сообщения."}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Цель публикации: {targetParts.join(" · ")}
            {updatedAt > 0 ? ` · updated at: ${new Date(updatedAt * 1000).toLocaleString("ru-RU")}` : ""}
            {updatedBy ? ` · updated by: ${updatedBy}` : ""}
          </div>
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
          {canManage ? (
            <button type="submit" className="secondaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={busy || loading}>
              {busy ? "Сохранение…" : "Сохранить Git mirror"}
            </button>
          ) : (
            <div className="text-xs text-slate-500">Недостаточно прав для изменения настроек Git mirror.</div>
          )}
        </form>
      )}
    </div>
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
      summary={(
        <OrgsSummaryRow
          items={payload?.items || []}
          activeOrgId={activeOrgId || payload?.active_org_id}
          activeOrgName={activeOrgName}
          activeOrgRole={activeOrgRole}
          isAdmin={isAdmin}
        />
      )}
    >
      <section id="admin-access-users" className="scroll-mt-20">
        <AdminUsersPanel
          isAdmin={isAdmin}
          activeOrgId={activeOrgId || payload?.active_org_id}
          orgOptions={payload?.items || []}
        />
      </section>
      <section id="admin-access-invites" className="scroll-mt-20">
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
      </section>
      <details id="admin-access-orgs" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Организации</summary>
        <div className="mt-3 space-y-3">
          <SectionIntro
            eyebrow="Организации"
            title="Организации"
            subtitle="Создание, переименование активной организации и обзор доступных организаций отделены от пользовательского доступа."
          >
            <div className="grid gap-3 lg:grid-cols-2">
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
            </div>
            <OrgsTable items={payload?.items || []} />
          </SectionIntro>
        </div>
      </details>
      <details id="admin-access-git" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Git mirror / публикация</summary>
        <div className="mt-3">
        <GitMirrorPanel
          activeOrgId={activeOrgId || payload?.active_org_id}
          activeOrgRole={activeOrgRole}
          isAdmin={isAdmin}
          onSaved={onRefresh}
        />
        </div>
      </details>
      <SystemStatusPanel />
    </AdminPageContainer>
  );
}
