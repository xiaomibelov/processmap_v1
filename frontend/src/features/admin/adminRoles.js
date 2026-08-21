function toText(value) {
  return String(value || "").trim().toLowerCase();
}

export const USER_FACING_ROLE_OPTIONS = [
  { value: "org_admin", label: "Администратор" },
  { value: "editor", label: "Редактор" },
  { value: "org_viewer", label: "Наблюдатель" },
];

export function toUserFacingRoleKey(roleRaw, { isAdmin = false } = {}) {
  if (isAdmin) return "admin";
  const role = toText(roleRaw);
  if (role === "platform_admin") return "admin";
  if (role === "org_owner" || role === "org_admin") return "admin";
  if (role === "project_manager" || role === "editor") return "editor";
  return "viewer";
}

export function toUserFacingRoleLabel(roleRaw, options = {}) {
  const key = toUserFacingRoleKey(roleRaw, options);
  if (key === "admin") return "Администратор";
  if (key === "editor") return "Редактор";
  return "Наблюдатель";
}

export function toRoleScopeHint(roleRaw, { isAdmin = false } = {}) {
  if (isAdmin || toText(roleRaw) === "platform_admin") return "все организации";
  const key = toUserFacingRoleKey(roleRaw, optionsWithAdminFalse);
  if (key === "admin") return "роль в организации";
  return "доступ в организации";
}

const optionsWithAdminFalse = { isAdmin: false };

export function toMembershipRoleValue(roleRaw) {
  const role = toText(roleRaw);
  if (role === "org_owner" || role === "org_admin") return "org_admin";
  if (role === "project_manager" || role === "editor") return "editor";
  return "org_viewer";
}

export function formatRoleWithScope(roleRaw, { isAdmin = false } = {}) {
  const label = toUserFacingRoleLabel(roleRaw, { isAdmin });
  const hint = toRoleScopeHint(roleRaw, { isAdmin });
  return hint ? `${label} · ${hint}` : label;
}
