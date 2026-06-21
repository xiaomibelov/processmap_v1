import { PERMISSION_KEYS } from "./userAccessConstants.js";

export function toText(value) {
  return String(value || "").trim();
}

export function getInitials(name = "", email = "") {
  const source = toText(name) || toText(email);
  if (!source) return "—";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0][0] || source[0] || "?").toUpperCase();
}

export function avatarColorClass(seed = "") {
  const colors = [
    "bg-slate-200 text-slate-700",
    "bg-indigo-200 text-indigo-700",
    "bg-emerald-200 text-emerald-700",
    "bg-amber-200 text-amber-700",
    "bg-rose-200 text-rose-700",
    "bg-violet-200 text-violet-700",
  ];
  const key = String(seed || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return colors[key % colors.length];
}

export function rolePermissionTemplate(role) {
  const key = toText(role);
  if (key === "org_admin" || key === "org_owner") {
    return { view: true, create: true, edit: true, export: true, delete: true, manage_users: true };
  }
  if (key === "editor" || key === "project_manager") {
    return { view: true, create: true, edit: true, export: true, delete: false, manage_users: false };
  }
  return { view: true, create: false, edit: false, export: false, delete: false, manage_users: false };
}

export function normalizePermissions(role, raw = {}) {
  const template = rolePermissionTemplate(role);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...template };
  }
  const out = {};
  PERMISSION_KEYS.forEach((key) => {
    if (key === "view") {
      out[key] = true;
    } else {
      out[key] = key in raw ? raw[key] === true : template[key];
    }
  });
  return out;
}

export function formatRoleLabel(role) {
  const key = toText(role);
  if (key === "org_admin" || key === "org_owner") return "Администратор";
  if (key === "editor" || key === "project_manager") return "Редактор";
  return "Наблюдатель";
}

export function formatDateTime(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  try {
    return new Date(value * 1000).toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function filterUsers(users = [], { query = "", filter = "all" }) {
  const q = toText(query).toLowerCase();
  return users.filter((user) => {
    const fullName = toText(user?.full_name || user?.fullName).toLowerCase();
    const email = toText(user?.email).toLowerCase();
    const jobTitle = toText(user?.job_title || user?.jobTitle).toLowerCase();
    const orgNames = (user?.memberships || [])
      .map((m) => toText(m?.org_name || m?.name || m?.org_id).toLowerCase())
      .join(" ");
    const matchesQuery =
      !q ||
      fullName.includes(q) ||
      email.includes(q) ||
      jobTitle.includes(q) ||
      orgNames.includes(q);

    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    const hasRole = (target) =>
      memberships.some((m) => {
        const role = toText(m?.role);
        if (target === "editor") return role === "editor" || role === "project_manager";
        if (target === "viewer") return role === "org_viewer" || role === "viewer" || role === "auditor";
        return false;
      });

    let matchesFilter = true;
    if (filter === "admins") matchesFilter = user?.is_admin === true;
    else if (filter === "editors") matchesFilter = !user?.is_admin && hasRole("editor");
    else if (filter === "viewers") matchesFilter = !user?.is_admin && (hasRole("viewer") || memberships.length === 0);
    else if (filter === "active") matchesFilter = user?.is_active === true;
    else if (filter === "inactive") matchesFilter = user?.is_active === false;

    return matchesQuery && matchesFilter;
  });
}

export function blankMembership(orgId = "") {
  return { org_id: toText(orgId), role: "editor", permissions: rolePermissionTemplate("editor") };
}

export function normalizeMemberships(items = [], fallbackOrgId = "") {
  const rows = Array.isArray(items) ? items : [];
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    const orgId = toText(row?.org_id);
    if (!orgId || seen.has(orgId)) return;
    const role = toText(row?.role) || "editor";
    out.push({
      org_id: orgId,
      role,
      permissions: normalizePermissions(role, row?.permissions),
    });
    seen.add(orgId);
  });
  if (out.length > 0) return out;
  return fallbackOrgId ? [blankMembership(fallbackOrgId)] : [blankMembership("")];
}
