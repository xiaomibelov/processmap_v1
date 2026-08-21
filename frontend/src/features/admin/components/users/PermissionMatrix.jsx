import { PERMISSION_LABELS, PERMISSION_KEYS } from "./userAccessConstants.js";

export function PermissionMatrix({ permissions = {}, onChange, disabled = false }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PERMISSION_KEYS.map((key) => {
        const isView = key === "view";
        const checked = isView || permissions[key] === true;
        return (
          <label
            key={key}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 transition ${
              disabled || isView ? "cursor-not-allowed bg-gray-50" : "cursor-pointer hover:border-indigo-300"
            }`}
            title={isView ? "Просмотр всегда включён" : undefined}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              checked={checked}
              disabled={disabled || isView}
              onChange={(e) => onChange?.(key, e.target.checked)}
            />
            <span className="text-sm text-gray-700">{PERMISSION_LABELS[key]}</span>
          </label>
        );
      })}
    </div>
  );
}
