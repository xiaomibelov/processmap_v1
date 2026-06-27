import { useEffect, useMemo, useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import AdminTabs from "../components/common/AdminTabs";
import OrgsSummaryRow from "../components/orgs/OrgsSummaryRow";
import AdminOrgsPanel from "../components/orgs/AdminOrgsPanel";
import AdminOrgInvitesPanel from "../components/orgs/AdminOrgInvitesPanel";
import AdminUsersPanel from "../components/orgs/AdminUsersPanel";
import AdminPermissionsPanel from "../components/permissions/AdminPermissionsPanel";
import AdminGitMirrorPanel from "../components/gitMirror/AdminGitMirrorPanel";
import AdminSystemPanel from "../components/system/AdminSystemPanel";

const ALL_ORGS_TABS = [
  { id: "users", label: "Пользователи" },
  { id: "invites", label: "Инвайты" },
  { id: "permissions", label: "Permissions" },
  { id: "organizations", label: "Организации" },
  { id: "gitMirror", label: "Git mirror" },
  { id: "system", label: "Система" },
];

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
          <AdminGitMirrorPanel
            activeOrgId={effectiveOrgId}
            activeOrgRole={activeOrgRole}
            isAdmin={isAdmin}
            onSaved={onRefresh}
          />
        </div>
      );
    }
    if (activeTab === "system") {
      return (
        <div id="admin-access-system">
          <AdminSystemPanel />
        </div>
      );
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
