import React, { useState } from "react";
import { collapseBreadcrumbTrail } from "./textBreadcrumbs.js";

// Текстовые хлебные крошки (часть А, nav-zone): родители — приглушённые
// текстовые ссылки (hover: underline), текущий сегмент — полужирный текст
// основным цветом, без чипов/пилюль/фонов. Длинные пути сворачиваются в «…».

export { collapseBreadcrumbTrail };

export default function TextBreadcrumbs({ crumbs = [], dataTestId = "text-breadcrumbs" }) {
  const [expanded, setExpanded] = useState(false);
  const list = (Array.isArray(crumbs) ? crumbs : []).filter(
    (crumb) => crumb && String(crumb.label || "").trim(),
  );
  if (!list.length) return null;

  const model = expanded
    ? { collapsed: false, items: list.map((crumb) => ({ type: "crumb", crumb })) }
    : collapseBreadcrumbTrail(list);
  const lastKey = list[list.length - 1].key;

  return (
    <nav
      className="flex min-w-0 flex-nowrap items-center gap-x-1 text-[13px] leading-5 h-9"
      aria-label="Путь"
      data-testid={dataTestId}
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
                className="rounded text-muted transition-colors hover:text-fg hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
                className={`truncate ${isCurrent ? "font-semibold text-fg" : "text-muted"}`}
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
