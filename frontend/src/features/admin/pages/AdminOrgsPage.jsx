import { useEffect, useMemo, useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import AdminTabs from "../components/common/AdminTabs";
import OrgsSummaryRow from "../components/orgs/OrgsSummaryRow";
import AdminOrgsPanel from "../components/orgs/AdminOrgsPanel";
import AdminOrgInvitesPanel from "../components/orgs/AdminOrgInvitesPanel";
import AdminUsersPanel from "../components/orgs/AdminUsersPanel";
import AdminPermissionsPanel from "../components/permissions/AdminPermissionsPanel";
import { ru } from "../../../shared/i18n/ru";
import {
  apiGetOrgGitMirrorConfig,
  apiPatchOrgGitMirrorConfig,
} from "../../../lib/api";

const ALL_ORGS_TABS = [
  { id: "users", label: "Пользователи" },
  { id: "invites", label: "Инвайты" },
  { id: "permissions", label: "Permissions" },
  { id: "organizations", label: "Организации" },
  { id: "gitMirror", label: "Git mirror" },
  { id: "system", label: "Система" },
];

function SystemStatusPanel() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
      <div className="font-semibold text-slate-800">{ru.admin.orgsPage.notesTitle || "Системное состояние и служебные заметки"}</div>
      <div className="mt-2 space-y-2 text-xs text-slate-500">
        <p>{ru.admin.orgsPage.notesBody}</p>
        <p>Redis и runtime health остаются в операционной сводке; на этой странице они не конкурируют с управлением пользователями и доступом.</p>
      </div>
    </div>
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
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

function _canManagePermissions(isAdmin, activeOrgRole) {
  return isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
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
  const canManagePermissions = useMemo(() => _canManagePermissions(isAdmin, activeOrgRole), [isAdmin, activeOrgRole]);
  const visibleTabs = useMemo(
    () => ALL_ORGS_TABS.filter((t) => t.id !== "permissions" || canManagePermissions),
    [canManagePermissions]
  );

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "users";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    return tab && visibleTabs.some((t) => t.id === tab) ? tab : "users";
  });
  const effectiveOrgId = activeOrgId || payload?.active_org_id;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === activeTab) return;
    if (activeTab === "users") {
      params.delete("tab");
    } else {
      params.set("tab", activeTab);
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [activeTab]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab("users");
    }
  }, [visibleTabs, activeTab]);

  function renderTabContent() {
    if (activeTab === "users") {
      return (
        <div id="admin-access-users">
          <AdminUsersPanel
            isAdmin={isAdmin}
            activeOrgId={effectiveOrgId}
            orgOptions={payload?.items || []}
          />
        </div>
      );
    }
    if (activeTab === "invites") {
      return (
        <div id="admin-access-invites">
          <AdminOrgInvitesPanel
            items={payload?.items || []}
            activeOrgId={effectiveOrgId}
            activeOrgName={activeOrgName}
            activeOrgRole={activeOrgRole}
            isAdmin={isAdmin}
            onChanged={onRefresh}
            recentInvite={recentInvite}
            onInviteCreated={onInviteCreated}
          />
        </div>
      );
    }
    if (activeTab === "permissions") {
      return (
        <div id="admin-access-permissions">
          <AdminPermissionsPanel orgId={effectiveOrgId} />
        </div>
      );
    }
    if (activeTab === "organizations") {
      return (
        <div id="admin-access-orgs">
          <AdminOrgsPanel
            items={payload?.items || []}
            activeOrgId={effectiveOrgId}
            activeOrgRole={activeOrgRole}
            isAdmin={isAdmin}
            onRefresh={onRefresh}
          />
        </div>
      );
    }
    if (activeTab === "gitMirror") {
      return (
        <div id="admin-access-git">
          <GitMirrorPanel
            activeOrgId={effectiveOrgId}
            activeOrgRole={activeOrgRole}
            isAdmin={isAdmin}
            onSaved={onRefresh}
          />
        </div>
      );
    }
    if (activeTab === "system") {
      return <div id="admin-access-system"><SystemStatusPanel /></div>;
    }
    return null;
  }

  return (
    <AdminPageContainer
      summary={(
        <OrgsSummaryRow
          items={payload?.items || []}
          activeOrgId={effectiveOrgId}
          activeOrgName={activeOrgName}
          activeOrgRole={activeOrgRole}
          isAdmin={isAdmin}
        />
      )}
    >
      <AdminTabs tabs={visibleTabs} activeTab={activeTab} onChange={setActiveTab} />
      {renderTabContent()}
    </AdminPageContainer>
  );
}
