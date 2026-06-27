import { useMemo } from "react";

const ROLE_META = {
  org_owner: { label: "Owner", short: "O" },
  org_admin: { label: "Admin", short: "A" },
  editor: { label: "Editor", short: "E" },
  project_manager: { label: "PM", short: "PM" },
  org_viewer: { label: "Viewer", short: "V" },
  auditor: { label: "Auditor", short: "Aud" },
};

const ROLE_ORDER = ["org_owner", "org_admin", "editor", "project_manager", "org_viewer", "auditor"];

export function usePermissionKeys(entityType) {
  return useMemo(() => {
    if (entityType === "analytics") {
      return ["dk_view", "dk_export", "fk_view", "fk_export", "manage_dashboards"];
    }
    if (entityType === "users" || entityType === "folders" || entityType === "workspaces") {
      return ["view", "edit", "manage", "admin"];
    }
    return ["view", "edit", "manage"];
  }, [entityType]);
}

export function formatPermissionKey(key) {
  const map = {
    view: "View",
    edit: "Edit",
    manage: "Manage",
    admin: "Admin",
    dk_view: "DK View",
    dk_export: "DK Export",
    fk_view: "FK View",
    fk_export: "FK Export",
    manage_dashboards: "Dashboards",
  };
  return map[key] || key;
}

export function AdminPermissionToggles({
  entityType,
  rolePermissions = {},
  onChange,
  size = "sm",
}) {
  const keys = usePermissionKeys(entityType);
  const sizeCls = size === "xs"
    ? "px-1 py-0.5 text-[10px]"
    : "px-2 py-1 text-xs";

  function toggle(role, key) {
    const next = { ...rolePermissions };
    if (!next[role]) next[role] = {};
    next[role] = { ...next[role], [key]: !next[role][key] };
    onChange?.(role, next[role]);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {ROLE_ORDER.map((role) => {
        const meta = ROLE_META[role];
        const perms = rolePermissions[role] || {};
        return (
          <div key={role} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1 py-0.5">
            <span className="text-[10px] font-medium text-slate-500" title={meta.label}>{meta.short}</span>
            {keys.map((key) => {
              const active = perms[key] === true;
              return (
                <button
                  key={key}
                  type="button"
                  title={`${meta.label}: ${formatPermissionKey(key)}`}
                  onClick={() => toggle(role, key)}
                  className={`rounded ${sizeCls} font-medium transition ${
                    active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                  }`}
                >
                  {formatPermissionKey(key).split(" ").map((w) => w[0]).join("")}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function AdminPermissionSummary({ entityType, permissions = {} }) {
  const keys = usePermissionKeys(entityType);
  const roles = ROLE_ORDER.filter((r) => permissions[r]);
  if (!roles.length) return <span className="text-xs text-slate-400">Default</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => {
        const perms = permissions[role] || {};
        const active = keys.filter((k) => perms[k]).map(formatPermissionKey).join(", ") || "View";
        return (
          <span key={role} className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
            <span className="font-medium">{ROLE_META[role].short}:</span>
            <span className="ml-1 text-slate-500">{active}</span>
          </span>
        );
      })}
    </div>
  );
}
