import React from "react";

export default function SubprocessBreadcrumbs({ breadcrumbs = [], onNavigate, onBack }) {
  if (!breadcrumbs || breadcrumbs.length < 2) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
        title="Назад"
      >
        ←
      </button>
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return (
          <React.Fragment key={crumb.session_id || idx}>
            {idx > 0 && <span className="text-neutral-400">&gt;</span>}
            {isLast ? (
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{crumb.name || "Текущий"}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(crumb.session_id)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {crumb.name || "..."}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
