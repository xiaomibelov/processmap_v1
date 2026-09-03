import React, { useState } from "react";
import { collapseBreadcrumbTrail } from "./textBreadcrumbs.js";

// Текстовые хлебные крошки (часть А, nav-zone): родители — приглушённые
// текстовые ссылки (hover: underline), текущий сегмент — обычный текст
// основным цветом, без чипов/пилюль/фонов. Длинные пути сворачиваются в «…».

export { collapseBreadcrumbTrail };

export default function TextBreadcrumbs({
  crumbs = [],
  dataTestId = "text-breadcrumbs",
  singleLine = false,
  currentClassName = "",
  forceCollapse = false,
  maxVisible = 4,
}) {
  const [expanded, setExpanded] = useState(false);
  const list = (Array.isArray(crumbs) ? crumbs : []).filter(
    (crumb) => crumb && String(crumb.label || "").trim(),
  );
  if (!list.length) return null;

  const model = expanded && !forceCollapse
    ? { collapsed: false, items: list.map((crumb) => ({ type: "crumb", crumb })) }
    : collapseBreadcrumbTrail(list, forceCollapse ? 2 : maxVisible);
  const lastKey = list[list.length - 1].key;
  const fullPath = list.map((crumb) => crumb.label).join(" / ");

  return (
    <nav
      className={`flex min-w-0 items-center gap-x-1 text-[13px] leading-5 ${
        singleLine ? "flex-nowrap overflow-hidden whitespace-nowrap" : "flex-wrap"
      }`}
      aria-label="Путь"
      data-testid={dataTestId}
      title={fullPath}
    >
      {model.items.map((item, index) => {
        const separator = index > 0 ? (
          <span key={`sep-${index}`} className="shrink-0 select-none text-muted/50" aria-hidden="true">
            /
          </span>
        ) : null;
        if (item.type === "ellipsis") {
          const hiddenNames = (item.hidden || []).map((c) => c.label).join(" / ");
          return (
            <React.Fragment key="ellipsis">
              {separator}
              <button
                type="button"
                className="shrink-0 rounded text-muted transition-colors hover:text-fg hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                title={hiddenNames ? `Показать: ${hiddenNames}` : "Показать весь путь"}
                onClick={() => setExpanded(true)}
                data-testid={`${dataTestId}-ellipsis`}
              >
                …
              </button>
            </React.Fragment>
          );
        }
        const { crumb } = item;
        const isCurrent = crumb.key === lastKey || index === model.items.length - 1;
        return (
          <React.Fragment key={crumb.key || `crumb-${index}`}>
            {separator}
            {isCurrent || typeof crumb.onClick !== "function" ? (
              <span
                className={`${isCurrent ? `shrink-0 text-fg ${currentClassName}`.trim() : "truncate text-muted"}`}
                aria-current={isCurrent ? "page" : undefined}
                data-current={isCurrent ? "true" : undefined}
                data-testid={crumb.testId}
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                className="truncate rounded text-muted transition-colors hover:text-fg hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                onClick={crumb.onClick}
                data-testid={crumb.testId}
              >
                {crumb.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
