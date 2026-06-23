import React from "react";

export default function SubprocessBreadcrumbs({ breadcrumbs = [], onNavigate }) {
  const list = Array.isArray(breadcrumbs) ? breadcrumbs : [];
  if (list.length === 0) return null;

  return (
    <div
      className="subprocessBreadcrumbs inline-flex flex-wrap items-center gap-2 px-3 py-1.5 bg-neutral-100/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm text-sm"
      data-testid="subprocess-breadcrumbs"
    >
      {list.map((crumb, idx) => {
        const isLast = idx === list.length - 1;
        const key = crumb?.session_id || idx;
        return (
          <React.Fragment key={key}>
            {idx > 0 && <span className="text-neutral-400 select-none">&gt;</span>}
            {isLast ? (
              <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[240px]">
                {crumb?.name || "Текущий"}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate?.(crumb?.session_id)}
                className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[160px]"
              >
                {crumb?.name || "..."}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
