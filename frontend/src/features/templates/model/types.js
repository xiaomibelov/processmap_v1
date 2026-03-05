export const TEMPLATE_SCOPES = ["personal", "org"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

export function normalizeTemplateScope(scopeRaw) {
  const scope = toText(scopeRaw).toLowerCase();
  return TEMPLATE_SCOPES.includes(scope) ? scope : "personal";
}

export function normalizeTemplateRecord(raw, defaults = {}) {
  const item = asObject(raw);
  const fallback = asObject(defaults);
  const createdAt = Number(item.created_at || item.createdAt || fallback.created_at || fallback.createdAt || Date.now()) || Date.now();
  const updatedAt = Number(item.updated_at || item.updatedAt || createdAt) || createdAt;
  const elementTypes = Array.from(new Set(asArray(item.element_types || item.elementTypes).map((row) => toText(row)).filter(Boolean)));
  const laneNames = Array.from(new Set(asArray(item.lane_names || item.laneNames).map((row) => toText(row)).filter(Boolean)));
  const bpmnElementIds = Array.from(new Set(asArray(item.bpmn_element_ids || item.bpmnElementIds).map((row) => toText(row)).filter(Boolean)));
  const scope = normalizeTemplateScope(item.scope || fallback.scope);
  const title = toText(item.title || item.name || fallback.title || fallback.name) || "Template";
  const id = toText(item.id || item.template_id || item.templateId || fallback.id) || `tpl_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: title,
    title,
    scope,
    created_at: createdAt,
    updated_at: updatedAt,
    user_id: toText(item.user_id || item.userId || fallback.user_id || fallback.userId),
    owner_user_id: toText(item.owner_user_id || item.ownerUserId || item.user_id || fallback.owner_user_id || fallback.ownerUserId || fallback.user_id || fallback.userId),
    org_id: toText(item.org_id || item.orgId || fallback.org_id || fallback.orgId),
    bpmn_element_ids: bpmnElementIds,
    element_types: elementTypes,
    lane_names: laneNames,
    primary_element_id: toText(item.primary_element_id || item.primaryElementId || bpmnElementIds[0] || ""),
    selection_count: Number(item.selection_count || item.selectionCount || bpmnElementIds.length || 0),
    source_session_id: toText(item.source_session_id || item.sourceSessionId || fallback.source_session_id || fallback.sourceSessionId),
    notes: toText(item.notes || ""),
    meta: {
      source: toText(asObject(item.meta).source || asObject(fallback.meta).source || "diagram_selection"),
    },
    can_edit: item.can_edit !== undefined ? Boolean(item.can_edit) : Boolean(fallback.can_edit ?? true),
    can_delete: item.can_delete !== undefined ? Boolean(item.can_delete) : Boolean(fallback.can_delete ?? true),
  };
}
