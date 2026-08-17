import React, { useMemo } from "react";
import NavZone from "./NavZone.jsx";
import { getManualSessionStatusMeta } from "../features/workspace/workspacePermissions";
import { normalizeManualSessionStatus } from "../features/workspace/sessionStatus.js";

// Часть А (nav-zone): однострочная полоса сессии над ProcessStageHeader.
// ← Назад к проекту / крошки / статус / мета. Внутренности ProcessStageHeader
// не трогаем; testid'ы сохранены для e2e.

const STATUS_CHIP_STYLES = {
  draft: { dot: "#9CA3AF" },
  in_progress: { dot: "#3B82F6" },
  review: { dot: "#F59E0B" },
  ready: { dot: "#10B981" },
  archived: { dot: "#6B7280" },
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
    return items;
  }, [breadcrumbBase, projectTitle, sessionTitle, tobeActive, onBackToProject, onOpenWorkspace]);

  const status = isChangingStatus
    ? { label: "Сохранение…", isLoading: true, title: "Сохранение статуса", testId: "topbar-session-status" }
    : {
        dot: statusStyle.dot,
        label: statusMeta.label,
        title: `Статус: ${statusMeta.label}`,
        testId: "topbar-session-status",
      };

  return (
    <div data-testid="session-nav-strip">
      <NavZone
        back={{
          testId: "topbar-back-projects",
          label: "← Назад к проекту",
          title: "Вернуться к проекту",
          onClick: () => onBackToProject?.(),
        }}
        breadcrumbsTestId="topbar-breadcrumbs"
        crumbs={crumbItems}
        status={status}
        meta={`Тип: ${tobeActive ? "TO BE" : "AS IS"}`}
        metaTestId="session-nav-meta"
      />
    </div>
  );
}
