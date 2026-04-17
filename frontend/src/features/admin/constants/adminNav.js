import { ADMIN_ROUTE_META, ADMIN_SECTIONS } from "./adminRoutes.constants";
import { ru } from "../../../shared/i18n/ru";

export const ADMIN_NAV_ITEMS = [
  { id: ADMIN_SECTIONS.dashboard, label: ru.admin.nav.dashboard, href: ADMIN_ROUTE_META.dashboard.path, shortLabel: "С" },
  { id: ADMIN_SECTIONS.sessions, label: ru.admin.nav.sessions, href: ADMIN_ROUTE_META.sessions.path, shortLabel: "Се" },
  { id: ADMIN_SECTIONS.jobs, label: ru.admin.nav.jobs, href: ADMIN_ROUTE_META.jobs.path, shortLabel: "З" },
  { id: ADMIN_SECTIONS.audit, label: ru.admin.nav.audit, href: ADMIN_ROUTE_META.audit.path, shortLabel: "А" },
  { id: ADMIN_SECTIONS.telemetry, label: ru.admin.nav.telemetry, href: ADMIN_ROUTE_META.telemetry.path, shortLabel: "Т" },
  { id: ADMIN_SECTIONS.orgs, label: ru.admin.nav.orgs, href: ADMIN_ROUTE_META.orgs.path, shortLabel: "О" },
  { id: ADMIN_SECTIONS.projects, label: ru.admin.nav.projects, href: ADMIN_ROUTE_META.projects.path, shortLabel: "П" },
];
