import { normalizeProductActionsList } from "./productActionsModel.js";

export const PRODUCT_ACTIONS_REGISTRY_SESSION_CAP = 20;

const REQUIRED_BUSINESS_FIELDS = Object.freeze([
  "product_name",
  "product_group",
  "action_type",
  "action_object",
]);

function toText(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readSessionId(sessionRaw = {}) {
  const session = isPlainObject(sessionRaw) ? sessionRaw : {};
  return toText(session.id || session.session_id || session.sessionId);
}

function readSessionTitle(sessionRaw = {}) {
  const session = isPlainObject(sessionRaw) ? sessionRaw : {};
  return toText(session.title || session.name || session.session_title || session.sessionTitle) || "Без названия";
}

function readProjectId(projectRaw = {}, sessionRaw = {}) {
  const project = isPlainObject(projectRaw) ? projectRaw : {};
  const session = isPlainObject(sessionRaw) ? sessionRaw : {};
  return toText(project.id || project.project_id || project.projectId || session.project_id || session.projectId);
}

function readProjectTitle(projectRaw = {}, sessionRaw = {}) {
  const project = isPlainObject(projectRaw) ? projectRaw : {};
  const session = isPlainObject(sessionRaw) ? sessionRaw : {};
  return toText(project.title || project.name || project.project_title || project.projectTitle || session.project_title || session.projectTitle);
}

export function productActionRegistryCompleteness(rowRaw) {
  const row = isPlainObject(rowRaw) ? rowRaw : {};
  const missing = REQUIRED_BUSINESS_FIELDS.filter((key) => !toText(row[key]));
  return {
    status: missing.length ? "incomplete" : "complete",
    missing,
  };
}

export function buildProductActionRegistryRows({ productActions = [], session = {}, project = {} } = {}) {
  const sessionId = readSessionId(session);
  const sessionTitle = readSessionTitle(session);
  const projectId = readProjectId(project, session);
  const projectTitle = readProjectTitle(project, session);

  return normalizeProductActionsList(productActions, { sessionId }).map((action) => {
    const completeness = productActionRegistryCompleteness(action);
    return {
      registry_id: `${sessionId || action.session_id || "session"}::${action.id}`,
      project_id: projectId,
      project_title: projectTitle,
      session_id: toText(action.session_id) || sessionId,
      session_title: sessionTitle,
      product_group: toText(action.product_group),
      product_name: toText(action.product_name),
      action_type: toText(action.action_type),
      action_stage: toText(action.action_stage),
      action_object_category: toText(action.action_object_category),
      action_object: toText(action.action_object),
      action_method: toText(action.action_method),
      role: toText(action.role),
      step_label: toText(action.step_label),
      step_id: toText(action.step_id),
      node_id: toText(action.node_id),
      bpmn_element_id: toText(action.bpmn_element_id || action.node_id),
      source: toText(action.source) || "manual",
      updated_at: toText(action.updated_at),
      completeness: completeness.status,
      missing_fields: completeness.missing,
      raw_action_id: toText(action.id),
    };
  });
}

export function summarizeProductActionRegistryRows(rowsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const sessionIds = new Set(rows.map((row) => toText(row?.session_id)).filter(Boolean));
  const complete = rows.filter((row) => row?.completeness === "complete").length;
  const incomplete = rows.length - complete;
  return {
    sessions: sessionIds.size,
    rows: rows.length,
    complete,
    incomplete,
  };
}

export function uniqueProductActionRegistryFilterOptions(rowsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const keys = [
    "product_group",
    "product_name",
    "action_type",
    "action_stage",
    "action_object_category",
    "role",
  ];
  return Object.fromEntries(keys.map((key) => {
    const values = [...new Set(rows.map((row) => toText(row?.[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    return [key, values];
  }));
}

export function filterProductActionRegistryRows(rowsRaw, filtersRaw = {}) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const filters = isPlainObject(filtersRaw) ? filtersRaw : {};
  return rows.filter((row) => {
    const completeness = toText(filters.completeness || "all");
    if (completeness !== "all" && row?.completeness !== completeness) return false;
    return [
      "product_group",
      "product_name",
      "action_type",
      "action_stage",
      "action_object_category",
      "role",
    ].every((key) => {
      const wanted = toText(filters[key]);
      return !wanted || toText(row?.[key]) === wanted;
    });
  });
}

export function enforceProductActionRegistrySessionCap(sessionIdsRaw, cap = PRODUCT_ACTIONS_REGISTRY_SESSION_CAP) {
  const ids = Array.isArray(sessionIdsRaw) ? sessionIdsRaw.map(toText).filter(Boolean) : [];
  const max = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Number(cap) : PRODUCT_ACTIONS_REGISTRY_SESSION_CAP;
  return {
    ok: ids.length <= max,
    selected: ids.length,
    cap: max,
  };
}
