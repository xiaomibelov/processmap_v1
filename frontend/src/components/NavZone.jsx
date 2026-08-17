import React from "react";
import TextBreadcrumbs from "./TextBreadcrumbs.jsx";
import "./NavZone.css";

// Однострочная навигационная зона ProcessMap (часть А, ревизия #730).
// Единый flex-ряд на всех уровнях: [← Назад] [крошки] [статус] [· мета].
// Адаптивность через container queries (NavZone.css):
//   <1100px — скрыть мета;
//   <760px  — кнопка «Назад» только иконкой;
//   <640px  — статус только точкой.

export default function NavZone({
  back = null,
  breadcrumbsTestId = "text-breadcrumbs",
  crumbs = [],
  status = null,
  meta = "",
  metaTestId = "",
  className = "",
}) {
  return (
    <div className={`nav-zone px-4 py-2 border-b border-border flex-shrink-0 bg-panel ${className}`}>
      <div className="nav-zone-row flex items-center gap-3 min-w-0 overflow-hidden">
        {back ? (
          <button
            type="button"
            onClick={back.onClick}
            title={back.title || back.label}
            aria-label={back.title || back.label}
            data-testid={back.testId}
            className="secondaryBtn h-9 shrink-0 px-3 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span className="nav-zone-back-icon" aria-hidden="true">←</span>
            {back.label ? (
              <span className="nav-zone-back-label ml-1">{back.label.replace(/^←\s*/, "")}</span>
            ) : null}
          </button>
        ) : null}

        <div className="min-w-0 h-9 flex items-center">
          <TextBreadcrumbs crumbs={crumbs} dataTestId={breadcrumbsTestId} />
        </div>

        {status ? (
          <span
            className="nav-zone-status inline-flex h-9 shrink-0 items-center gap-1.5 text-xs font-medium text-fg"
            title={status.title || status.label}
            data-testid={status.testId || undefined}
          >
            {status.isLoading ? (
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path
                  d="M22 12a10 10 0 0 1-10 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: status.dot || "currentColor" }}
              />
            )}
            <span className="nav-zone-status-label whitespace-nowrap">{status.label}</span>
          </span>
        ) : null}

        {meta ? (
          <span
            className="nav-zone-meta flex h-9 shrink-0 items-center text-xs text-muted whitespace-nowrap"
            aria-label={meta}
            data-testid={metaTestId || undefined}
          >
            · {meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}
