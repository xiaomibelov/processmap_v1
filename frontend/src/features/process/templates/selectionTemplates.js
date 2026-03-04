function toText(value) {
  return String(value || "").trim();
}

export function normalizeTemplateScope(raw) {
  const scope = toText(raw).toLowerCase();
  if (scope === "org") return "org";
  return "personal";
}

export function normalizeTemplateElementIds(rawList) {
  const seen = new Set();
  const out = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (let i = 0; i < list.length; i += 1) {
    const value = toText(list[i]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildSelectionTemplatePayload(options = {}) {
  const ids = normalizeTemplateElementIds(options?.selectedElementIds);
  return {
    bpmn_element_ids: ids,
    bpmn_fingerprint: toText(options?.bpmnFingerprint),
  };
}

export function readTemplateElementIds(templateRaw) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  const payload = template.payload && typeof template.payload === "object" ? template.payload : {};
  return normalizeTemplateElementIds(payload.bpmn_element_ids);
}

export function canCreateOrgTemplate(roleRaw, isAdminRaw = false) {
  if (Boolean(isAdminRaw)) return true;
  const role = toText(roleRaw).toLowerCase();
  return role === "org_owner" || role === "org_admin" || role === "project_manager";
}

export function canManageOrgTemplate(roleRaw, isAdminRaw = false) {
  if (Boolean(isAdminRaw)) return true;
  const role = toText(roleRaw).toLowerCase();
  return role === "org_owner" || role === "org_admin";
}

