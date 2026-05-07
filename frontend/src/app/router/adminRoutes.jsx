import { ADMIN_ROUTE_META } from "../../features/admin/constants/adminRoutes.constants";
import { parseAdminRoute, toText } from "../../features/admin/adminUtils";

export const adminRoutes = [
  { path: ADMIN_ROUTE_META.dashboard.path, section: "dashboard" },
  { path: ADMIN_ROUTE_META.orgs.path, section: "orgs" },
  { path: ADMIN_ROUTE_META.projects.path, section: "projects" },
  { path: ADMIN_ROUTE_META.sessions.path, section: "sessions" },
  { path: "/admin/sessions/:sessionId", section: "sessions_detail" },
  { path: ADMIN_ROUTE_META.jobs.path, section: "jobs" },
  { path: ADMIN_ROUTE_META.audit.path, section: "audit" },
  { path: ADMIN_ROUTE_META.telemetry.path, section: "telemetry" },
  { path: ADMIN_ROUTE_META["ai-modules"].path, section: "ai-modules" },
];

export function resolveAdminRoute(pathname = "/admin/dashboard") {
  const route = parseAdminRoute(pathname);
  const section = toText(route.section || "dashboard");
  return {
    ...route,
    meta: ADMIN_ROUTE_META[section] || ADMIN_ROUTE_META.dashboard,
  };
}
