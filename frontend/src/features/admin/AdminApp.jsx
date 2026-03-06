import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../auth/AuthProvider";
import ErrorState from "./components/common/ErrorState";
import LoadingBlock from "./components/common/LoadingBlock";
import { getAdminRouteMeta } from "./constants/adminRoutes.constants";
import AdminShell from "./layout/AdminShell";
import { buildAdminBreadcrumbs, canAccessAdminConsole, parseAdminRoute, toText } from "./adminUtils";
import useAdminAuditData from "./hooks/useAdminAuditData";
import useAdminDashboardData from "./hooks/useAdminDashboardData";
import useAdminJobsData from "./hooks/useAdminJobsData";
import useAdminOrgsData from "./hooks/useAdminOrgsData";
import useAdminProjectsData from "./hooks/useAdminProjectsData";
import useAdminSessionDetailData from "./hooks/useAdminSessionDetailData";
import useAdminSessionsData from "./hooks/useAdminSessionsData";
import AdminAuditPage from "./pages/AdminAuditPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminJobsPage from "./pages/AdminJobsPage";
import AdminOrgsPage from "./pages/AdminOrgsPage";
import AdminProjectsPage from "./pages/AdminProjectsPage";
import AdminSessionDetailPage from "./pages/AdminSessionDetailPage";
import AdminSessionsPage from "./pages/AdminSessionsPage";

export default function AdminApp({
  pathname = "/admin/dashboard",
  onNavigate,
}) {
  const { user, orgs, activeOrgId, switchOrg } = useAuth();
  const route = useMemo(() => parseAdminRoute(pathname), [pathname]);
  const meta = getAdminRouteMeta(route?.section);
  const [sessionFilters, setSessionFilters] = useState({
    q: "",
    status: "",
    ownerIds: "",
    updatedRange: "",
    attentionOnly: false,
  });
  const [auditFilters, setAuditFilters] = useState({
    q: "",
    status: "",
    action: "",
    projectId: "",
    sessionId: "",
    dateRange: "",
  });

  const canAccessAdmin = useMemo(() => canAccessAdminConsole(user, orgs), [orgs, user]);

  const dashboardQ = useAdminDashboardData({ enabled: route.section === "dashboard" });
  const orgsQ = useAdminOrgsData({ enabled: route.section === "orgs" });
  const projectsQ = useAdminProjectsData({ enabled: route.section === "projects", q: "" });
  const sessionsQ = useAdminSessionsData({
    enabled: route.section === "sessions" && !toText(route.sessionId),
    q: sessionFilters.q,
    status: sessionFilters.status,
    ownerIds: sessionFilters.ownerIds,
  });
  const sessionDetailQ = useAdminSessionDetailData({
    enabled: route.section === "sessions" && Boolean(toText(route.sessionId)),
    sessionId: route.sessionId,
  });
  const jobsQ = useAdminJobsData({ enabled: route.section === "jobs" });
  const auditQ = useAdminAuditData({
    enabled: route.section === "audit",
    q: auditFilters.q,
    status: auditFilters.status,
    action: auditFilters.action,
    sessionId: auditFilters.sessionId,
    projectId: auditFilters.projectId,
  });

  useEffect(() => {
    if (route.isRoot) onNavigate?.("/admin/dashboard", { replace: true });
  }, [onNavigate, route.isRoot]);

  const breadcrumbs = useMemo(() => {
    const activeOrgName = (() => {
      const found = (Array.isArray(orgs) ? orgs : []).find((row) => toText(row?.org_id || row?.id) === toText(activeOrgId));
      return toText(found?.name || found?.org_name || activeOrgId);
    })();
    return buildAdminBreadcrumbs(route, activeOrgName);
  }, [activeOrgId, orgs, route]);

  const activeQuery = (() => {
    if (route.section === "dashboard") return dashboardQ;
    if (route.section === "orgs") return orgsQ;
    if (route.section === "projects") return projectsQ;
    if (route.section === "sessions" && toText(route.sessionId)) return sessionDetailQ;
    if (route.section === "sessions") return sessionsQ;
    if (route.section === "jobs") return jobsQ;
    if (route.section === "audit") return auditQ;
    return { loading: false, error: "", data: null };
  })();

  function renderPage() {
    if (!canAccessAdmin) {
      return <ErrorState title="Admin access denied" message="Current actor does not have admin/backoffice permissions for this contour." />;
    }
    if (activeQuery.loading) {
      return <LoadingBlock label="Loading admin section…" />;
    }
    if (activeQuery.error) {
      return <ErrorState title="Admin data error" message={activeQuery.error} />;
    }
    if (route.section === "dashboard") {
      return <AdminDashboardPage payload={dashboardQ.data || {}} onNavigate={onNavigate} />;
    }
    if (route.section === "orgs") {
      return <AdminOrgsPage payload={orgsQ.data || {}} />;
    }
    if (route.section === "projects") {
      return <AdminProjectsPage payload={projectsQ.data || {}} />;
    }
    if (route.section === "sessions" && toText(route.sessionId)) {
      return (
        <AdminSessionDetailPage
          payload={sessionDetailQ.data || {}}
          loading={sessionDetailQ.loading}
          error={sessionDetailQ.error}
          onBack={() => onNavigate?.("/admin/sessions")}
          onNavigate={onNavigate}
        />
      );
    }
    if (route.section === "sessions") {
      return (
        <AdminSessionsPage
          payload={sessionsQ.data || {}}
          filters={sessionFilters}
          onFiltersChange={setSessionFilters}
          onOpenSession={(sid) => onNavigate?.(`/admin/sessions/${encodeURIComponent(toText(sid))}`)}
        />
      );
    }
    if (route.section === "jobs") {
      return <AdminJobsPage payload={jobsQ.data || {}} />;
    }
    if (route.section === "audit") {
      return <AdminAuditPage payload={auditQ.data || {}} filters={auditFilters} onFiltersChange={setAuditFilters} />;
    }
    return <ErrorState title="Unknown admin route" message={pathname} />;
  }

  const redisMode = (() => {
    const mode = toText(dashboardQ.data?.kpis?.redis_mode || dashboardQ.data?.redis_health?.mode);
    if (mode) return mode;
    const fallbackRaw = sessionDetailQ.data?.item?.tabs?.diagnostics?.raw?.redis_fallback;
    if (fallbackRaw === true) return "FALLBACK";
    if (fallbackRaw === false) return "ON";
    return "UNKNOWN";
  })();
  const pageBadges = [
    { label: "Section", value: meta.title, tone: "default" },
    { label: "Route", value: pathname, tone: "default" },
    { label: "Access", value: canAccessAdmin ? "allowed" : "forbidden", tone: canAccessAdmin ? "ok" : "danger" },
  ];

  return (
    <AdminShell
      section={route.section}
      orgs={orgs}
      activeOrgId={activeOrgId}
      onOrgChange={(nextOrgId) => {
        const next = toText(nextOrgId);
        if (!next || next === toText(activeOrgId)) return;
        void switchOrg(next, { refreshMe: false });
      }}
      breadcrumbs={breadcrumbs}
      onNavigate={onNavigate}
      user={user}
      redisMode={redisMode}
      pageTitle={meta.title}
      pageSubtitle={meta.subtitle}
      pageBadges={pageBadges}
    >
      {renderPage()}
    </AdminShell>
  );
}
