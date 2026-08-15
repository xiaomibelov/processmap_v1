import React, { useMemo } from "react";
import TextBreadcrumbs from "./TextBreadcrumbs.jsx";
import { getManualSessionStatusMeta } from "../features/workspace/workspacePermissions";
import { normalizeManualSessionStatus } from "../features/workspace/sessionStatus.js";

// Часть А (nav-zone): полоса сессии над ProcessStageHeader.
// Кнопка «← Назад к проекту» + текстовые крошки под ней, H1 сессии со
// статус-пилюлей рядом, мета-строка. Тот же текстовый стиль, что и в
// explorer-заголовках; testid'ы сохранены для совместимости с e2e.

const STATUS_CHIP_STYLES = {
  draft: { dot: "#9CA3AF", bg: "#F3F4F6", text: "#4B5563", border: "#E5E7EB" },
  in_progress: { dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  review: { dot: "#F59E0B", bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  ready: { dot: "#10B981", bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  archived: { dot: "#6B7280", bg: "#F9FAFB", text: "#4B5563", border: "#E5E7EB" },
};

function toText(v) {
  return String(v || "").trim();
}

export default function SessionNavStrip({
  breadcrumbBase = [],
  projectTitle = "",
  sessionTitle = "",
  tobeActive = false,
  sessionStatus = "",
  isChangingStatus = false,
  onBackToProject,
  onOpenWorkspace,
}) {
  const normalizedStatus = normalizeManualSessionStatus(sessionStatus, "draft");
  const statusMeta = getManualSessionStatusMeta(normalizedStatus);
  const statusStyle = STATUS_CHIP_STYLES[normalizedStatus] || STATUS_CHIP_STYLES.draft;

  const crumbItems = useMemo(() => {
    const items = [];
    const base = Array.isArray(breadcrumbBase) ? breadcrumbBase : [];
    // Родители из контекста explorer (workspace/папки): ведут в корень рабочей
    // области (глубокая навигация до папки из сессии не заведена).
    base
      .filter((crumb) => toText(crumb?.name))
      .forEach((crumb, index) => {
        items.push({
          key: `base-${crumb.type}-${crumb.id || index}`,
          label: toText(crumb.name),
          onClick: () => onOpenWorkspace?.(),
        });
      });
    if (toText(projectTitle)) {
      items.push({
        key: "project",
        label: toText(projectTitle),
        onClick: () => onBackToProject?.(),
        testId: "topbar-crumb-project",
      });
    }
    items.push({
      key: "session",
      label: toText(sessionTitle) || "Сессия",
      testId: "topbar-crumb-session",
    });
    if (tobeActive) {
      items.push({ key: "tobe", label: "TO BE", testId: "topbar-crumb-tobe" });
    }
    // Текущий сегмент — последний; ссылку снимает TextBreadcrumbs.
    return items;
  }, [breadcrumbBase, projectTitle, sessionTitle, tobeActive, onBackToProject, onOpenWorkspace]);

  return (
    <div
      className="px-4 pt-3 pb-2 border-b border-border flex-shrink-0"
      data-testid="session-nav-strip"
    >
      <div className="flex flex-col items-start">
        <button
          type="button"
          className="secondaryBtn h-8 min-h-0 px-3 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          onClick={() => onBackToProject?.()}
          title="Вернуться к проекту"
          data-testid="topbar-back-projects"
        >
          ← Назад к проекту
        </button>
        <div className="mt-1 min-w-0">
          <TextBreadcrumbs crumbs={crumbItems} dataTestId="topbar-breadcrumbs" />
        </div>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-lg font-semibold text-fg" data-testid="session-nav-title">
              {toText(sessionTitle) || "Сессия"}
            </h1>
            <span
              className="statusComboPill inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium"
              style={{
                backgroundColor: statusStyle.bg,
                color: statusStyle.text,
                borderColor: statusStyle.border,
              }}
              title="Статус сессии"
              data-testid="topbar-session-status"
            >
              {isChangingStatus ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusStyle.dot }} />
              )}
              <span className="whitespace-nowrap">{isChangingStatus ? "Сохранение…" : statusMeta.label}</span>
            </span>
          </div>
          <span className="mt-0.5 text-xs text-muted" data-testid="session-nav-meta">
            Тип: {tobeActive ? "TO BE" : "AS IS"}
          </span>
        </div>
      </div>
    </div>
  );
}
