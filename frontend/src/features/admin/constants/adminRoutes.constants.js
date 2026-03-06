export const ADMIN_SECTIONS = {
  dashboard: "dashboard",
  orgs: "orgs",
  projects: "projects",
  sessions: "sessions",
  jobs: "jobs",
  audit: "audit",
};

export const ADMIN_ROUTE_META = {
  [ADMIN_SECTIONS.dashboard]: {
    title: "Dashboard",
    subtitle: "Operations console for ProcessMap / Food Process Copilot",
    path: "/admin/dashboard",
  },
  [ADMIN_SECTIONS.orgs]: {
    title: "Organizations",
    subtitle: "Org memberships, access posture, invite health",
    path: "/admin/orgs",
  },
  [ADMIN_SECTIONS.projects]: {
    title: "Projects",
    subtitle: "Project portfolio, session volume, reporting readiness",
    path: "/admin/projects",
  },
  [ADMIN_SECTIONS.sessions]: {
    title: "Sessions",
    subtitle: "Primary diagnostics surface for BPMN, AutoPass, reports, and persistence",
    path: "/admin/sessions",
  },
  [ADMIN_SECTIONS.jobs]: {
    title: "Jobs",
    subtitle: "Queue health, retries, lock contention, execution failures",
    path: "/admin/jobs",
  },
  [ADMIN_SECTIONS.audit]: {
    title: "Audit",
    subtitle: "Operational event trail across org, project, session, and admin actions",
    path: "/admin/audit",
  },
};

export function getAdminRouteMeta(section = ADMIN_SECTIONS.dashboard) {
  return ADMIN_ROUTE_META[section] || ADMIN_ROUTE_META[ADMIN_SECTIONS.dashboard];
}

export function buildAdminSessionPath(sessionId = "") {
  const value = String(sessionId || "").trim();
  return value ? `/admin/sessions/${encodeURIComponent(value)}` : ADMIN_ROUTE_META.sessions.path;
}

