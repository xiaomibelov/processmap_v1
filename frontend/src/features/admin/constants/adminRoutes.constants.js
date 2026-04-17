import { ru } from "../../../shared/i18n/ru";

export const ADMIN_SECTIONS = {
  dashboard: "dashboard",
  orgs: "orgs",
  projects: "projects",
  sessions: "sessions",
  jobs: "jobs",
  audit: "audit",
  telemetry: "telemetry",
};

export const ADMIN_ROUTE_META = {
  [ADMIN_SECTIONS.dashboard]: {
    title: ru.admin.route.dashboard.title,
    subtitle: ru.admin.route.dashboard.subtitle,
    path: "/admin/dashboard",
  },
  [ADMIN_SECTIONS.orgs]: {
    title: ru.admin.route.orgs.title,
    subtitle: ru.admin.route.orgs.subtitle,
    path: "/admin/orgs",
  },
  [ADMIN_SECTIONS.projects]: {
    title: ru.admin.route.projects.title,
    subtitle: ru.admin.route.projects.subtitle,
    path: "/admin/projects",
  },
  [ADMIN_SECTIONS.sessions]: {
    title: ru.admin.route.sessions.title,
    subtitle: ru.admin.route.sessions.subtitle,
    path: "/admin/sessions",
  },
  [ADMIN_SECTIONS.jobs]: {
    title: ru.admin.route.jobs.title,
    subtitle: ru.admin.route.jobs.subtitle,
    path: "/admin/jobs",
  },
  [ADMIN_SECTIONS.audit]: {
    title: ru.admin.route.audit.title,
    subtitle: ru.admin.route.audit.subtitle,
    path: "/admin/audit",
  },
  [ADMIN_SECTIONS.telemetry]: {
    title: ru.admin.route.telemetry.title,
    subtitle: ru.admin.route.telemetry.subtitle,
    path: "/admin/telemetry",
  },
};

export function getAdminRouteMeta(section = ADMIN_SECTIONS.dashboard) {
  return ADMIN_ROUTE_META[section] || ADMIN_ROUTE_META[ADMIN_SECTIONS.dashboard];
}

export function buildAdminSessionPath(sessionId = "") {
  const value = String(sessionId || "").trim();
  return value ? `/admin/sessions/${encodeURIComponent(value)}` : ADMIN_ROUTE_META.sessions.path;
}
