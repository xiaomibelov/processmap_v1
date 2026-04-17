import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useAdminTelemetryErrorEventDetailData, useAdminTelemetryErrorEventsData } from "./hooks/useAdminTelemetryData";
import AdminAuditPage from "./pages/AdminAuditPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminJobsPage from "./pages/AdminJobsPage";
import AdminOrgsPage from "./pages/AdminOrgsPage";
import AdminProjectsPage from "./pages/AdminProjectsPage";
import AdminSessionDetailPage from "./pages/AdminSessionDetailPage";
import AdminSessionsPage from "./pages/AdminSessionsPage";
import AdminTelemetryEventsPage from "./pages/AdminTelemetryEventsPage";
import { buildTelemetrySearchPatch, DEFAULT_TELEMETRY_FILTERS, parseTelemetryFiltersFromSearch } from "./utils/adminTelemetryQuery";
import { mergeSearchParams, pageToOffset, parsePage, parsePageSize, rangeToTsFrom } from "./utils/adminQuery";
import { ru } from "../../shared/i18n/ru";

export default function AdminApp({
  pathname = "/admin/dashboard",
  search = "",
  onNavigate,
}) {
  const { user, orgs, activeOrgId, switchOrg } = useAuth();
  const route = useMemo(() => parseAdminRoute(pathname), [pathname]);
  const meta = getAdminRouteMeta(route?.section);
  const [recentOrgInvite, setRecentOrgInvite] = useState(null);
  const searchText = String(search || "");
  const rawSearch = searchText.startsWith("?") ? searchText.slice(1) : searchText;

  const paging = useMemo(() => {
    const params = new URLSearchParams(rawSearch);
    const pageSize = parsePageSize(params.get("page_size"), 20);
    const page = parsePage(params.get("page"), 1);
    return {
      page,
      pageSize,
      offset: pageToOffset(page, pageSize),
    };
  }, [rawSearch]);

  const projectsFilters = useMemo(() => {
    const params = new URLSearchParams(rawSearch);
    return { q: toText(params.get("q")) };
  }, [rawSearch]);

  const sessionFilters = useMemo(() => {
    const params = new URLSearchParams(rawSearch);
    const attentionRaw = toText(params.get("attention_only")).toLowerCase();
    return {
      q: toText(params.get("q")),
      status: toText(params.get("status")),
      ownerIds: toText(params.get("owner_ids")),
      updatedRange: toText(params.get("updated_range")),
      attentionOnly: attentionRaw === "1" || attentionRaw === "true" || attentionRaw === "yes" || attentionRaw === "on",
    };
  }, [rawSearch]);

  const auditFilters = useMemo(() => {
    const params = new URLSearchParams(rawSearch);
    return {
      q: toText(params.get("q")),
      status: toText(params.get("status")),
      action: toText(params.get("action")),
      projectId: toText(params.get("project_id")),
      sessionId: toText(params.get("session_id")),
      dateRange: toText(params.get("date_range")),
    };
  }, [rawSearch]);

  const telemetryFilters = useMemo(() => parseTelemetryFiltersFromSearch(rawSearch), [rawSearch]);

  const updateSearchState = useCallback((patch = {}, { replace = false, resetPage = false } = {}) => {
    const params = mergeSearchParams(rawSearch, patch, { resetPage });
    const nextRaw = params.toString();
    const nextPath = nextRaw ? `${pathname}?${nextRaw}` : pathname;
    onNavigate?.(nextPath, { replace });
  }, [onNavigate, pathname, rawSearch]);

  const canAccessAdmin = useMemo(() => canAccessAdminConsole(user, orgs), [orgs, user]);
  const currentOrg = useMemo(() => {
    return (Array.isArray(orgs) ? orgs : []).find((row) => toText(row?.org_id || row?.id) === toText(activeOrgId)) || null;
  }, [orgs, activeOrgId]);
  const currentOrgName = toText(currentOrg?.name || currentOrg?.org_name || activeOrgId);
  const currentOrgRole = toText(currentOrg?.role);

  const dashboardQ = useAdminDashboardData({ enabled: route.section === "dashboard" });
  const orgsQ = useAdminOrgsData({ enabled: route.section === "orgs" });
  const projectsQ = useAdminProjectsData({
    enabled: route.section === "projects",
    q: projectsFilters.q,
    limit: paging.pageSize,
    offset: paging.offset,
  });
  const sessionsQ = useAdminSessionsData({
    enabled: route.section === "sessions" && !toText(route.sessionId),
    q: sessionFilters.q,
    status: sessionFilters.status,
    ownerIds: sessionFilters.ownerIds,
    updatedFrom: rangeToTsFrom(sessionFilters.updatedRange),
    updatedTo: 0,
    needsAttention: sessionFilters.attentionOnly ? 1 : -1,
    limit: paging.pageSize,
    offset: paging.offset,
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
    updatedFrom: rangeToTsFrom(auditFilters.dateRange),
    updatedTo: 0,
    limit: paging.pageSize,
    offset: paging.offset,
  });
  const telemetryQ = useAdminTelemetryErrorEventsData({
    enabled: route.section === "telemetry",
    filters: telemetryFilters,
  });
  const telemetryDetailQ = useAdminTelemetryErrorEventDetailData({
    enabled: route.section === "telemetry" && Boolean(toText(telemetryFilters.event_id)),
    eventId: telemetryFilters.event_id,
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
    if (route.section === "telemetry") return telemetryQ;
    return { loading: false, error: "", data: null };
  })();

  function renderPage() {
    if (!canAccessAdmin) {
      return <ErrorState title={ru.admin.runtime.accessDeniedTitle} message={ru.admin.runtime.accessDeniedMessage} />;
    }
    if (route.section !== "telemetry" && activeQuery.loading) {
      return <LoadingBlock label={ru.admin.runtime.loadingSection} />;
    }
    if (route.section !== "telemetry" && activeQuery.error) {
      return <ErrorState title={ru.admin.runtime.dataErrorTitle} message={activeQuery.error} />;
    }
    if (route.section === "dashboard") {
      return <AdminDashboardPage payload={dashboardQ.data || {}} onNavigate={onNavigate} />;
    }
    if (route.section === "orgs") {
      return (
        <AdminOrgsPage
          payload={orgsQ.data || {}}
          activeOrgId={activeOrgId}
          activeOrgName={currentOrgName}
          activeOrgRole={currentOrgRole}
          isAdmin={Boolean(user?.is_admin)}
          onRefresh={() => orgsQ.reload?.()}
          recentInvite={recentOrgInvite}
          onInviteCreated={setRecentOrgInvite}
        />
      );
    }
    if (route.section === "projects") {
      return (
        <AdminProjectsPage
          payload={projectsQ.data || {}}
          filters={projectsFilters}
          onFiltersChange={(next) => {
            updateSearchState({ q: toText(next?.q), page: "1" }, { replace: true, resetPage: true });
          }}
          paging={paging}
          onPagingChange={(next) => {
            const hasPageSize = Number(next?.pageSize || 0) > 0;
            updateSearchState(
              {
                page: String(hasPageSize ? 1 : parsePage(next?.page, paging.page)),
                page_size: String(hasPageSize ? parsePageSize(next?.pageSize, paging.pageSize) : paging.pageSize),
              },
              { replace: false },
            );
          }}
        />
      );
    }
    if (route.section === "sessions" && toText(route.sessionId)) {
      return (
        <AdminSessionDetailPage
          payload={sessionDetailQ.data || {}}
          loading={sessionDetailQ.loading}
          error={sessionDetailQ.error}
          onBack={() => onNavigate?.(rawSearch ? `/admin/sessions?${rawSearch}` : "/admin/sessions")}
          onNavigate={onNavigate}
        />
      );
    }
    if (route.section === "sessions") {
      return (
        <AdminSessionsPage
          payload={sessionsQ.data || {}}
          filters={sessionFilters}
          onFiltersChange={(next) => {
            updateSearchState(
              {
                q: toText(next?.q),
                status: toText(next?.status),
                owner_ids: toText(next?.ownerIds),
                updated_range: toText(next?.updatedRange),
                attention_only: next?.attentionOnly ? "1" : "",
                page: "1",
              },
              { replace: true, resetPage: true },
            );
          }}
          paging={paging}
          onPagingChange={(next) => {
            const hasPageSize = Number(next?.pageSize || 0) > 0;
            updateSearchState(
              {
                page: String(hasPageSize ? 1 : parsePage(next?.page, paging.page)),
                page_size: String(hasPageSize ? parsePageSize(next?.pageSize, paging.pageSize) : paging.pageSize),
              },
              { replace: false },
            );
          }}
          onOpenSession={(sid) => onNavigate?.(`/admin/sessions/${encodeURIComponent(toText(sid))}${rawSearch ? `?${rawSearch}` : ""}`)}
        />
      );
    }
    if (route.section === "jobs") {
      return <AdminJobsPage payload={jobsQ.data || {}} />;
    }
    if (route.section === "audit") {
      return (
        <AdminAuditPage
          payload={auditQ.data || {}}
          filters={auditFilters}
          onFiltersChange={(next) => {
            updateSearchState(
              {
                q: toText(next?.q),
                status: toText(next?.status),
                action: toText(next?.action),
                project_id: toText(next?.projectId),
                session_id: toText(next?.sessionId),
                date_range: toText(next?.dateRange),
                page: "1",
              },
              { replace: true, resetPage: true },
            );
          }}
          paging={paging}
          onPagingChange={(next) => {
            const hasPageSize = Number(next?.pageSize || 0) > 0;
            updateSearchState(
              {
                page: String(hasPageSize ? 1 : parsePage(next?.page, paging.page)),
                page_size: String(hasPageSize ? parsePageSize(next?.pageSize, paging.pageSize) : paging.pageSize),
              },
              { replace: false },
            );
          }}
        />
      );
    }
    if (route.section === "telemetry") {
      return (
        <AdminTelemetryEventsPage
          payload={telemetryQ.data || {}}
          filters={telemetryFilters}
          loading={telemetryQ.loading}
          error={telemetryQ.error}
          detailPayload={telemetryDetailQ.data || null}
          detailLoading={telemetryDetailQ.loading}
          detailError={telemetryDetailQ.error}
          selectedEventId={telemetryFilters.event_id}
          onFiltersChange={(next) => {
            updateSearchState(
              {
                ...buildTelemetrySearchPatch(next),
                event_id: "",
                page: "",
                page_size: "",
              },
              { replace: true, resetPage: false },
            );
          }}
          onFiltersReset={() => {
            updateSearchState(
              {
                ...buildTelemetrySearchPatch(DEFAULT_TELEMETRY_FILTERS),
                event_id: "",
                page: "",
                page_size: "",
              },
              { replace: true, resetPage: false },
            );
          }}
          onOpenDetail={(eventId) => {
            const id = toText(eventId);
            if (!id) return;
            updateSearchState({ event_id: id }, { replace: false });
          }}
          onCloseDetail={() => updateSearchState({ event_id: "" }, { replace: false })}
        />
      );
    }
    return <ErrorState title={ru.admin.runtime.unknownRouteTitle} message={pathname} />;
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
    { label: ru.admin.runtime.badges.section, value: meta.title, tone: "default" },
    { label: ru.admin.runtime.badges.route, value: pathname, tone: "default" },
    { label: ru.admin.runtime.badges.access, value: canAccessAdmin ? ru.admin.runtime.badges.allowed : ru.admin.runtime.badges.forbidden, tone: canAccessAdmin ? "ok" : "danger" },
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
