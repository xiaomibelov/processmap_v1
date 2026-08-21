function toText(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeWorkspaceRole(roleRaw, isAdmin = false) {
  if (isAdmin) return "admin";
  const role = toText(roleRaw);
  if (role === "org_owner" || role === "org_admin") return "admin";
  if (role === "org_viewer") return "viewer";
  if (role === "project_manager" || role === "editor") return "editor";
  return "viewer";
}

export function buildWorkspacePermissions(roleRaw, isAdmin = false) {
  const role = normalizeWorkspaceRole(roleRaw, isAdmin);
  const canEdit = role === "admin" || role === "editor";
  const canManage = role === "admin";
  return {
    role,
    canView: true,
    canEdit,
    canCreate: canEdit,
    canRenameWorkspace: canManage,
    canRenameFolder: canEdit,
    canRenameProject: canEdit,
    canRenameSession: canEdit,
    canChangeStatus: canEdit,
    canDeleteSession: canManage,
    canDeleteProject: canManage,
    canDeleteFolder: canManage,
    canManageInvites: canManage,
    canManageUsers: canManage,
    canViewAdmin: canManage,
  };
}

export const INVITE_ROLE_OPTIONS = [
  { value: "org_admin", label: "Администратор" },
  { value: "editor", label: "Редактор" },
  { value: "org_viewer", label: "Наблюдатель" },
];

export const MANUAL_SESSION_STATUSES = [
  { value: "draft", label: "Черновик" },
  { value: "in_progress", label: "В работе" },
  { value: "review", label: "На проверке" },
  { value: "ready", label: "Готово" },
  { value: "archived", label: "Архив" },
];

export function getManualSessionStatusMeta(statusRaw) {
  const status = toText(statusRaw) || "draft";
  const map = {
    draft: {
      label: "Черновик",
      badgeClass: "border-slate-300 bg-slate-100 text-slate-700 dark:border-borderStrong dark:bg-panel2 dark:text-fg",
      selectClass: "border-slate-300 bg-slate-50 text-slate-700 dark:border-borderStrong dark:bg-panel2 dark:text-fg",
    },
    in_progress: {
      label: "В работе",
      badgeClass: "border-sky-300 bg-sky-50 text-sky-700 dark:border-info/55 dark:bg-info/10 dark:text-info",
      selectClass: "border-sky-300 bg-sky-50 text-sky-700 dark:border-info/55 dark:bg-info/10 dark:text-info",
    },
    review: {
      label: "На проверке",
      badgeClass: "border-amber-300 bg-amber-50 text-amber-700 dark:border-warning/55 dark:bg-warning/10 dark:text-warning",
      selectClass: "border-amber-300 bg-amber-50 text-amber-700 dark:border-warning/55 dark:bg-warning/10 dark:text-warning",
    },
    ready: {
      label: "Готово",
      badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-success/55 dark:bg-success/10 dark:text-success",
      selectClass: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-success/55 dark:bg-success/10 dark:text-success",
    },
    archived: {
      label: "Архив",
      badgeClass: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-borderStrong dark:bg-bgSoft dark:text-muted",
      selectClass: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-borderStrong dark:bg-bgSoft dark:text-muted",
    },
  };
  return map[status] || map.draft;
}
