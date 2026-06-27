import { useMemo } from "react";

const PERMISSION_LABELS = {
  view: "Просмотр",
  create: "Создание",
  edit: "Редактирование",
  export: "Экспорт",
  delete: "Удаление",
  manage_users: "Управление пользователями",
};

const PERMISSION_KEYS = ["view", "create", "edit", "export", "delete", "manage_users"];

export function invitePermissionDefaults(role) {
  const key = String(role || "").trim().toLowerCase();
  if (key === "org_owner" || key === "org_admin") {
    return { view: true, create: true, edit: true, export: true, delete: true, manage_users: true };
  }
  if (key === "project_manager" || key === "editor") {
    return { view: true, create: true, edit: true, export: true, delete: false, manage_users: false };
  }
  return { view: true, create: false, edit: false, export: false, delete: false, manage_users: false };
}

export default function AdminInvitePermissionEditor({ role = "", value = {}, onChange, disabled = false }) {
  const effective = useMemo(() => {
    const defaults = invitePermissionDefaults(role);
    const merged = { ...defaults };
    Object.entries(value || {}).forEach(([k, v]) => {
      if (k in merged) merged[k] = v === true;
    });
    return merged;
  }, [role, value]);

  function toggle(key) {
    if (key === "view") return;
    const next = { ...(value || {}) };
    next[key] = !effective[key];
    onChange?.(next);
  }

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {PERMISSION_KEYS.map((key) => {
        const checked = effective[key] === true;
        const isView = key === "view";
        return (
          <label
            key={key}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${disabled || isView ? "cursor-default bg-slate-50 text-slate-500" : "cursor-pointer bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={checked}
              disabled={disabled || isView}
              onChange={() => toggle(key)}
            />
            <span>{PERMISSION_LABELS[key] || key}</span>
          </label>
        );
      })}
    </div>
  );
}

export function AdminInvitePermissionSummary({ permissions = {}, role = "" }) {
  const defaults = invitePermissionDefaults(role);
  const keys = PERMISSION_KEYS.filter((k) => k !== "view" && (permissions[k] === true || (permissions[k] !== false && defaults[k])));
  if (!keys.length) return <span className="text-xs text-slate-400">По умолчанию</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
          {PERMISSION_LABELS[k] || k}
        </span>
      ))}
    </span>
  );
}
