function toText(value) {
  return String(value || "").trim().toLowerCase();
}

const ORG_TEMPLATE_MANAGE_ROLES = new Set(["org_owner", "org_admin", "project_manager"]);

export function canCreateOrgTemplateForRole(roleRaw, isAdmin = false) {
  if (Boolean(isAdmin)) return true;
  return ORG_TEMPLATE_MANAGE_ROLES.has(toText(roleRaw));
}

export function canMutateTemplate({ template, userId = "", isAdmin = false, activeOrgRole = "" } = {}) {
  if (Boolean(isAdmin)) return true;
  const item = template && typeof template === "object" ? template : {};
  const ownerId = String(item.owner_user_id || item.user_id || "").trim();
  const uid = String(userId || "").trim();
  if (ownerId && uid && ownerId === uid) return true;
  const scope = toText(item.scope || "personal");
  if (scope === "org") {
    return canCreateOrgTemplateForRole(activeOrgRole, false);
  }
  return false;
}
