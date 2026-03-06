import { ADMIN_ROUTE_META, ADMIN_SECTIONS } from "./adminRoutes.constants";

export const ADMIN_NAV_ITEMS = [
  { id: ADMIN_SECTIONS.dashboard, label: "Dashboard", href: ADMIN_ROUTE_META.dashboard.path, shortLabel: "D" },
  { id: ADMIN_SECTIONS.sessions, label: "Sessions", href: ADMIN_ROUTE_META.sessions.path, shortLabel: "S" },
  { id: ADMIN_SECTIONS.jobs, label: "Jobs", href: ADMIN_ROUTE_META.jobs.path, shortLabel: "J" },
  { id: ADMIN_SECTIONS.audit, label: "Audit", href: ADMIN_ROUTE_META.audit.path, shortLabel: "A" },
  { id: ADMIN_SECTIONS.orgs, label: "Organizations", href: ADMIN_ROUTE_META.orgs.path, shortLabel: "O" },
  { id: ADMIN_SECTIONS.projects, label: "Projects", href: ADMIN_ROUTE_META.projects.path, shortLabel: "P" },
];

