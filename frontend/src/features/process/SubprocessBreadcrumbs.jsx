import React, { useState } from "react";
import { collapseBreadcrumbTrail } from "../../components/textBreadcrumbs.js";

function formatTooltip(crumb) {
  const name = String(crumb?.name || "Без названия").trim();
  const sid = String(crumb?.session_id || "").trim();
  const eid = String(crumb?.element_id || "").trim();
  const parts = [name];
  if (sid) parts.push(`id: ${sid}`);
  if (eid) parts.push(`element: ${eid}`);
  return parts.join(" · ");
}

export default function SubprocessBreadcrumbs({ breadcrumbs = [], onNavigate }) {
  const list = Array.isArray(breadcrumbs) ? breadcrumbs : [];
  if (list.length === 0) return null;

  const [expanded, setExpanded] = useState(false);

  const crumbs = list.map((crumb, idx) => ({
    key: `${idx}-${String(crumb?.session_id || idx)}`,
    label: String(crumb?.name || "Без названия").trim() || "Без названия",
    tooltip: formatTooltip(crumb),
    testId: `subprocess-crumb-${idx}`,
    onClick: idx === list.length - 1 ? undefined : () => onNavigate?.(crumb?.session_id, idx),
  }));

  const model = expanded
    ? { collapsed: false, items: crumbs.map((crumb) => ({ type: "crumb", crumb })) }
    : collapseBreadcrumbTrail(crumbs, 4);

  return (
    <div
      className="subprocessBreadcrumbs inline-flex flex-nowrap items-center gap-2 px-3 py-1.5 bg-neutral-100/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm text-sm min-w-0"
      data-testid="subprocess-breadcrumbs"
    >
      {model.items.map((item, idx) => {
        const separator = idx > 0 ? (
          <span key={`sep-${idx}`} className="text-neutral-400 select-none shrink-0">&gt;</span>
        ) : null;

        if (item.type === "ellipsis") {
          const hiddenNames = (item.hidden || []).map((c) => c.label).join(" > ");
          return (
            <React.Fragment key="ellipsis">
              {separator}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded px-1"
                title={hiddenNames ? `Показать: ${hiddenNames}` : "Показать весь путь"}
                data-testid="subprocess-breadcrumbs-ellipsis"
              >
                …
              </button>
            </React.Fragment>
          );
        }

        const { crumb } = item;
        const isLast = idx === model.items.length - 1;
        const content = (
          <span
            className={`truncate max-w-[200px] ${isLast ? "font-medium text-neutral-900 dark:text-neutral-100" : ""}`}
            title={crumb.tooltip}
            data-testid={crumb.testId}
          >
            {crumb.label}
          </span>
        );

        return (
          <React.Fragment key={crumb.key}>
            {separator}
            {isLast || typeof crumb.onClick !== "function" ? (
              content
            ) : (
              <button
                type="button"
                onClick={crumb.onClick}
                className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded min-w-0"
                title={crumb.tooltip}
                data-testid={crumb.testId}
              >
                {content}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
