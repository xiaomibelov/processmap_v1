import React, { useMemo } from "react";
import TextBreadcrumbs from "./TextBreadcrumbs.jsx";
import useElementWidth from "./useElementWidth.js";
import { getNavSingleLineLayout } from "./navSingleLineLayout.js";
import { getManualSessionStatusMeta } from "../features/workspace/workspacePermissions";
import { normalizeManualSessionStatus } from "../features/workspace/sessionStatus.js";

// Часть А-2 (nav-zone): однострочная полоса сессии над ProcessStageHeader
// (хедер не трогаем). Кнопка «← Назад к проекту» + текстовые крошки в той же
// строке; текущий сегмент (полужирный) заменяет H1; статус-бейдж (точка +
// подпись) сразу после него; мета — справа через «·», приглушённо.
// Строка никогда не переносится; жертвы по ширине контейнера:
// мета → крошки через «…» → статус точкой → кнопка иконкой.
// testid'ы сохранены для совместимости с e2e.

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
  const [stripRef, stripWidth] = useElementWidth();
  const layout = getNavSingleLineLayout(stripWidth);

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
      // Текущий сегмент заменяет H1 — testid заголовка живёт на нём.
      testId: "session-nav-title",
    });
    if (tobeActive) {
      items.push({ key: "tobe", label: "TO BE", testId: "topbar-crumb-tobe" });
    }
    // Текущий сегмент — последний; ссылку снимает TextBreadcrumbs.
    return items;
  }, [breadcrumbBase, projectTitle, sessionTitle, tobeActive, onBackToProject, onOpenWorkspace]);

  return (
    <div
      className="border-b border-border px-4 flex-shrink-0"
      data-testid="session-nav-strip"
    >
      <div
        ref={stripRef}
        className="flex h-10 min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap"
        data-nav-width={Math.round(stripWidth)}
        data-nav-meta={layout.showMeta ? "1" : "0"}
      >
        <button
          type="button"
          className={`secondaryBtn h-7 min-h-0 shrink-0 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            layout.backIconOnly ? "w-7 px-0" : "px-2.5"
          }`}
          onClick={() => onBackToProject?.()}
          title="Вернуться к проекту"
          aria-label="Назад к проекту"
          data-testid="topbar-back-projects"
        >
          {layout.backIconOnly ? "←" : "← Назад к проекту"}
        </button>
        <TextBreadcrumbs
          crumbs={crumbItems}
          dataTestId="topbar-breadcrumbs"
          singleLine
          forceCollapse={layout.collapseCrumbs}
          currentClassName="text-[15px] font-semibold"
        />
        <span
          className={`statusComboPill inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border text-xs font-medium ${
            layout.statusDotOnly ? "w-6 justify-center px-0" : "px-2.5"
          }`}
          style={{
            backgroundColor: statusStyle.bg,
            color: statusStyle.text,
            borderColor: statusStyle.border,
          }}
          title={`Статус сессии: ${isChangingStatus ? "Сохранение…" : statusMeta.label}`}
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
          {layout.statusDotOnly ? null : (
            <span className="whitespace-nowrap">{isChangingStatus ? "Сохранение…" : statusMeta.label}</span>
          )}
        </span>
        {layout.showMeta ? (
          <span
            className="ml-auto shrink-0 text-xs text-muted"
            data-testid="session-nav-meta"
          >
            · Тип: {tobeActive ? "TO BE" : "AS IS"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
