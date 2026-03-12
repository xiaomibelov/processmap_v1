import AdminBreadcrumbs from "./AdminBreadcrumbs";
import AdminPageHeader from "./AdminPageHeader";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

export default function AdminShell({
  section = "dashboard",
  orgs = [],
  activeOrgId = "",
  onOrgChange,
  breadcrumbs = [],
  onNavigate,
  user,
  redisMode = "UNKNOWN",
  pageTitle = "",
  pageSubtitle = "",
  pageBadges = [],
  pageActions = null,
  children,
}) {
  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-950">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <div className="lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0">
          <AdminSidebar section={section} onNavigate={onNavigate} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AdminTopbar
            user={user}
            orgs={orgs}
            activeOrgId={activeOrgId}
            onOrgChange={onOrgChange}
            onNavigate={onNavigate}
            redisMode={redisMode}
          />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
            <div className="mx-auto max-w-[1560px] space-y-5">
              <AdminBreadcrumbs items={breadcrumbs} onNavigate={onNavigate} />
              <AdminPageHeader
                title={pageTitle}
                subtitle={pageSubtitle}
                badges={pageBadges}
                actions={pageActions}
              />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
