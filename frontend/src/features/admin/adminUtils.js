import { computeDodPercent } from "../workspace/computeDodPercent";
import { ru } from "../../shared/i18n/ru";

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function toText(value) {
  return String(value || "").trim();
}

export function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : Math.round(fallback || 0);
}

export function toLower(value) {
  return toText(value).toLowerCase();
}

export function formatTs(tsRaw) {
  const ts = Number(tsRaw || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  const date = new Date(ts * 1000);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPct(valueRaw, fallback = "—") {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function parseAdminRoute(pathnameRaw) {
  const pathname = toText(pathnameRaw || "/admin");
  const clean = pathname.replace(/\/+$/g, "") || "/admin";
  if (!clean.startsWith("/admin")) {
    return { section: "dashboard", sectionLabel: ru.admin.sections.dashboard, sessionId: "", isRoot: false };
  }
  const tail = clean.slice("/admin".length).replace(/^\/+/g, "");
  if (!tail) {
    return { section: "dashboard", sectionLabel: ru.admin.sections.dashboard, sessionId: "", isRoot: true };
  }
  const parts = tail.split("/").filter(Boolean);
  const section = toLower(parts[0]) || "dashboard";
  const sessionId = section === "sessions" ? toText(parts[1]) : "";
  const labels = {
    dashboard: ru.admin.sections.dashboard,
    orgs: ru.admin.sections.orgs,
    projects: ru.admin.sections.projects,
    sessions: ru.admin.sections.sessions,
    jobs: ru.admin.sections.jobs,
    audit: ru.admin.sections.audit,
    telemetry: ru.admin.sections.telemetry,
    "ai-modules": ru.admin.sections.aiModules,
  };
  return {
    section,
    sectionLabel: labels[section] || section,
    sessionId,
    isRoot: false,
  };
}

export function buildAdminBreadcrumbs(route, activeOrgName = "") {
  const crumbs = [{ id: "admin", label: ru.admin.sections.admin, href: "/admin/dashboard" }];
  const section = toLower(route?.section || "dashboard");
  if (section !== "dashboard") {
    crumbs.push({
      id: section,
      label: toText(route?.sectionLabel || section),
      href: `/admin/${section}`,
    });
  }
  if (section === "sessions" && toText(route?.sessionId)) {
    crumbs.push({
      id: "session_detail",
      label: `SID ${toText(route?.sessionId)}`,
      href: `/admin/sessions/${toText(route?.sessionId)}`,
    });
  }
  if (toText(activeOrgName)) {
    crumbs.push({
      id: "org_ctx",
      label: toText(activeOrgName),
      href: "",
    });
  }
  return crumbs;
}

export function canAccessAdminConsole(userRaw, orgsRaw = []) {
  const user = asObject(userRaw);
  if (Boolean(user.is_admin)) return true;
  const userRole = toLower(user.role || user.user_role);
  if (userRole === "admin" || userRole === "super_admin" || userRole === "auditor") return true;
  const allowed = new Set(["org_owner", "org_admin", "org_manager", "manager", "auditor"]);
  return asArray(orgsRaw).some((row) => allowed.has(toLower(asObject(row).role)));
}

function deriveSessionStatusFlags(sessionRaw) {
  const session = asObject(sessionRaw);
  const dod = computeDodPercent(session);
  const meta = asObject(session.bpmn_meta);
  const autoPass = asObject(meta.auto_pass_v1);
  const autoPassStatus = toLower(autoPass.status || autoPass.job_status);
  const autoPassExecution = toLower(autoPass.execution);
  const reportsVersions = toInt(
    asObject(session.dod_artifacts).reports_versions ?? session.reports_versions ?? 0,
    0,
  );
  const quality = asObject(meta.quality);
  const qualityErrors = toInt(quality.errors, 0);
  const qualityWarnings = toInt(quality.warnings, 0);
  const attention = toInt(session.needs_attention, 0);
  const redisFallback = (
    meta.redis_fallback === true
    || toLower(asObject(meta.redis).mode) === "fallback"
    || autoPassExecution.startsWith("sync_fallback")
  );
  const bpmnReady = dod.breakdown?.find?.((row) => row.id === "bpmn_present")?.done === true;
  const interviewReady = dod.breakdown?.find?.((row) => row.id === "interview_filled")?.done === true;
  const pathsReady = dod.breakdown?.find?.((row) => row.id === "paths_mapped")?.done === true;
  const reportsReady = dod.breakdown?.find?.((row) => row.id === "ai_report_created")?.done === true || reportsVersions > 0;
  const docReady = reportsReady || toInt(asObject(meta.doc).version, 0) > 0;
  return {
    dod,
    bpmnReady,
    interviewReady,
    pathsReady,
    autoPassStatus: autoPassStatus || "idle",
    autoPassDone: autoPassStatus === "done",
    reportsReady,
    docReady,
    reportsVersions,
    qualityErrors,
    qualityWarnings,
    attention,
    warningsTotal: Math.max(0, qualityErrors + qualityWarnings + attention + (autoPassStatus === "failed" ? 1 : 0)),
    redisFallback,
    autoPassSummary: asObject(autoPass.summary),
    autoPassError: toText(autoPass.error_message || autoPass.error || ""),
  };
}

export function buildSessionRows(sessionsRaw = [], projectsRaw = []) {
  const projectTitleById = new Map(
    asArray(projectsRaw).map((row) => {
      const item = asObject(row);
      const id = toText(item.id || item.project_id);
      return [id, toText(item.title || item.name || id) || id];
    }),
  );
  return asArray(sessionsRaw)
    .map((raw) => {
      const session = asObject(raw);
      const id = toText(session.id || session.session_id);
      const projectId = toText(session.project_id);
      const ownerId = toText(session.owner_id || session.owner_user_id || session.created_by);
      const flags = deriveSessionStatusFlags(session);
      return {
        ...session,
        id,
        title: toText(session.title || session.name || id) || id,
        status: toLower(session.status || "draft") || "draft",
        mode: toText(session.mode),
        projectId,
        projectTitle: projectTitleById.get(projectId) || projectId || "—",
        ownerId: ownerId || "—",
        updatedAt: toInt(session.updated_at, 0),
        createdAt: toInt(session.created_at, 0),
        flags,
      };
    })
    .filter((row) => row.id)
    .sort((a, b) => {
      const dt = Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      if (dt !== 0) return dt;
      return String(a.id || "").localeCompare(String(b.id || ""), "en");
    });
}

export function buildTemplatesRows(personalRaw = [], orgRaw = []) {
  const all = [
    ...asArray(personalRaw).map((row) => ({ ...asObject(row), scopeResolved: "personal" })),
    ...asArray(orgRaw).map((row) => ({ ...asObject(row), scopeResolved: "org" })),
  ];
  return all.map((row) => {
    const payload = asObject(row.payload);
    const type = toLower(row.template_type || "bpmn_selection_v1") || "bpmn_selection_v1";
    const ids = asArray(row.bpmn_element_ids);
    const fragment = asObject(asObject(payload.pack).fragment || payload.fragment);
    const hybridElements = asArray(payload.elements);
    const brokenAnchor = type === "bpmn_selection_v1" && ids.length === 0;
    const missingElements = (
      (type === "bpmn_fragment_v1" && asArray(fragment.nodes).length === 0)
      || (type === "hybrid_stencil_v1" && hybridElements.length === 0)
    );
    const usage = toInt(row.usage_count ?? row.apply_count ?? 0, 0);
    return {
      ...row,
      id: toText(row.id),
      name: toText(row.name || row.id),
      scope: toLower(row.scope || row.scopeResolved || "personal"),
      templateType: type,
      usageCount: usage,
      lastAppliedAt: toInt(row.last_applied_at, 0),
      selectionCount: toInt(row.selection_count, ids.length),
      brokenAnchor,
      missingElements,
      crossSessionDiagnostic: type === "bpmn_selection_v1" ? "Session-bound IDs; prefer bpmn_fragment_v1." : "Portable",
    };
  }).filter((row) => row.id);
}

export function buildJobsRows(sessionRows = []) {
  const rows = [];
  asArray(sessionRows).forEach((session) => {
    const autoPass = asObject(asObject(session.bpmn_meta).auto_pass_v1);
    const autoStatus = toLower(autoPass.status || "");
    if (autoStatus) {
      rows.push({
        id: `autopass_${session.id}`,
        kind: "AutoPass",
        sessionId: session.id,
        sessionTitle: session.title,
        status: autoStatus,
        durationSec: toInt(autoPass.duration_s ?? autoPass.duration_sec ?? 0, 0),
        retries: toInt(autoPass.retry_count ?? 0, 0),
        lockBusy: toInt(autoPass.lock_busy_count ?? 0, 0),
        error: toText(autoPass.error_message || autoPass.error),
        updatedAt: toInt(autoPass.generated_at || session.updatedAt, session.updatedAt),
      });
    }
    const reportsVersions = toInt(asObject(session.dod_artifacts).reports_versions ?? session.reports_versions, 0);
    if (reportsVersions > 0) {
      rows.push({
        id: `reports_${session.id}`,
        kind: "Report/Doc",
        sessionId: session.id,
        sessionTitle: session.title,
        status: "done",
        durationSec: 0,
        retries: 0,
        lockBusy: 0,
        error: "",
        updatedAt: session.updatedAt,
      });
    }
  });
  return rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export function buildAdminKpis({
  orgs = [],
  projects = [],
  sessionRows = [],
  templatesRows = [],
  meta = {},
}) {
  const rows = asArray(sessionRows);
  const activeSessions = rows.filter((row) => row.status === "in_progress").length;
  const autoRuns = rows.filter((row) => toLower(row.flags?.autoPassStatus) && row.flags?.autoPassStatus !== "idle");
  const autoDone = autoRuns.filter((row) => row.flags?.autoPassDone).length;
  const autoFailed = autoRuns.filter((row) => row.flags?.autoPassStatus === "failed").length;
  const autoRate = autoRuns.length ? Math.round((autoDone / autoRuns.length) * 100) : null;
  const templateUsage = asArray(templatesRows).reduce((sum, row) => sum + Number(row.usageCount || 0), 0);
  const reportDocJobs = rows.filter((row) => row.flags?.reportsReady || row.flags?.docReady).length;
  const redisMode = (() => {
    const features = asObject(asObject(meta).features);
    const redis = asObject(asObject(meta).redis);
    const redisModeRaw = toLower(redis.mode || "");
    if (redisModeRaw === "error") return "ERROR";
    if (redisModeRaw === "fallback") return "FALLBACK";
    if (redisModeRaw === "on") return "ON";
    const hasFallback = rows.some((row) => row.flags?.redisFallback);
    if (hasFallback) return "FALLBACK";
    if (features.redis === true) return "ON";
    if (features.redis === false) return "FALLBACK";
    return "UNKNOWN";
  })();
  return {
    organizations: asArray(orgs).length,
    projects: asArray(projects).length,
    activeSessions,
    autoPassSuccessRate: autoRate,
    failedJobs: autoFailed,
    templateUsage,
    reportDocJobs,
    redisMode,
  };
}

export function buildActivitySeries(sessionRows = [], days = 10) {
  const dayCount = Math.max(3, Math.min(31, Number(days || 10)));
  const now = new Date();
  const points = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const dt = new Date(now);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    points.push({ key, label: `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}`, count: 0 });
  }
  const map = new Map(points.map((point) => [point.key, point]));
  asArray(sessionRows).forEach((row) => {
    const ts = Number(row.updatedAt || row.updated_at || 0);
    if (!Number.isFinite(ts) || ts <= 0) return;
    const dt = new Date(ts * 1000);
    if (!Number.isFinite(dt.getTime())) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (!map.has(key)) return;
    map.get(key).count += 1;
  });
  return points;
}

export function buildAdminRouteMap() {
  return [
    { path: "/admin/dashboard", section: ru.admin.sections.dashboard },
    { path: "/admin/orgs", section: ru.admin.sections.orgs },
    { path: "/admin/projects", section: ru.admin.sections.projects },
    { path: "/admin/sessions", section: ru.admin.sections.sessions },
    { path: "/admin/sessions/:sessionId", section: ru.admin.sections.sessionDetail },
    { path: "/admin/jobs", section: ru.admin.sections.jobs },
    { path: "/admin/audit", section: ru.admin.sections.audit },
  ];
}
