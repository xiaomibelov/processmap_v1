import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TextBreadcrumbs from "./TextBreadcrumbs.jsx";
import useElementWidth from "./useElementWidth.js";
import { getNavSingleLineLayout } from "./navSingleLineLayout.js";
import {
  getManualSessionStatusMeta,
  MANUAL_SESSION_STATUSES,
} from "../features/workspace/workspacePermissions";
import {
  getAllowedNextStatuses,
  normalizeManualSessionStatus,
} from "../features/workspace/sessionStatus.js";

// Часть А-2 (nav-zone): однострочная полоса сессии над ProcessStageHeader
// (хедер не трогаем). Кнопка «← Назад к проекту» + текстовые крошки в той же
// строке; текущий сегмент (полужирный) заменяет H1; статус-бейдж (точка +
// подпись) сразу после него; мета — справа через «·», приглушённо.
// Строка никогда не переносится; жертвы по ширине контейнера:
// мета → крошки через «…» → статус точкой → кнопка иконкой.
// testid'ы сохранены для совместимости с e2e.
//
// П4 (а): пилюля статуса — интерактивный контрол. Клик открывает поповер
// смены статуса (только допустимые переходы из матрицы sessionStatus.js);
// меню уходит в portal на document.body с fixed-позиционированием от якоря,
// чтобы не обрезаться overflow-hidden строки полосы и workspaceMain.

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
  onChangeStatus,
  onBackToProject,
  onOpenWorkspace,
}) {
  const normalizedStatus = normalizeManualSessionStatus(sessionStatus, "draft");
  const statusMeta = getManualSessionStatusMeta(normalizedStatus);
  const statusStyle = STATUS_CHIP_STYLES[normalizedStatus] || STATUS_CHIP_STYLES.draft;
  const [stripRef, stripWidth] = useElementWidth();
  const layout = getNavSingleLineLayout(stripWidth);
  const canChangeStatus = typeof onChangeStatus === "function";

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const pillRef = useRef(null);
  const statusMenuRef = useRef(null);
  const [statusMenuPos, setStatusMenuPos] = useState({ top: 0, left: 0 });

  const statusOptions = useMemo(() => {
    const allowed = getAllowedNextStatuses(normalizedStatus);
    return MANUAL_SESSION_STATUSES.filter((option) => allowed.has(option.value));
  }, [normalizedStatus]);

  // позиция меню — от якоря-пилюли; пересчитываем на resize, пока меню открыто
  useEffect(() => {
    if (!statusMenuOpen) return undefined;
    const updatePosition = () => {
      const rect = pillRef.current?.getBoundingClientRect?.();
      if (!rect) return;
      setStatusMenuPos({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, (window.innerWidth || 0) - 180)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [statusMenuOpen]);

  // закрытие по клику вне пилюли/меню и по Escape
  useEffect(() => {
    if (!statusMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (pillRef.current && pillRef.current.contains(event.target)) return;
      if (statusMenuRef.current && statusMenuRef.current.contains(event.target)) return;
      setStatusMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setStatusMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [statusMenuOpen]);

  // клавиатурная навигация по пунктам: ↑/↓ — фокус, Enter/Space — выбор
  const handleStatusMenuKeyDown = (event) => {
    const items = Array.from(
      statusMenuRef.current?.querySelectorAll('[role="menuitemradio"]') || [],
    );
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (items[index + 1] || items[0])?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (items[index - 1] || items[items.length - 1])?.focus();
    }
  };

  const toggleStatusMenu = () => {
    if (!canChangeStatus || isChangingStatus) return;
    setStatusMenuOpen((value) => !value);
  };

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

  const pillClassName = `statusComboPill inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border text-xs font-medium ${
    layout.statusDotOnly ? "w-6 justify-center px-0" : "px-2.5"
  }${canChangeStatus ? "" : " statusComboPill--readonly"}`;
  const pillStyle = {
    backgroundColor: statusStyle.bg,
    color: statusStyle.text,
    borderColor: statusStyle.border,
  };
  const pillTitle = `Статус сессии: ${isChangingStatus ? "Сохранение…" : statusMeta.label}`;
  const pillContent = (
    <>
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
    </>
  );

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
        {canChangeStatus ? (
          <button
            ref={pillRef}
            type="button"
            className={pillClassName}
            style={pillStyle}
            title={pillTitle}
            aria-label={`Сменить статус сессии (сейчас: ${statusMeta.label})`}
            aria-haspopup="menu"
            aria-expanded={statusMenuOpen}
            disabled={isChangingStatus}
            onClick={toggleStatusMenu}
            data-testid="topbar-session-status"
          >
            {pillContent}
          </button>
        ) : (
          <span
            ref={pillRef}
            className={pillClassName}
            style={pillStyle}
            title={pillTitle}
            data-testid="topbar-session-status"
          >
            {pillContent}
          </span>
        )}
        {statusMenuOpen && canChangeStatus ? (
          createPortal(
            <span
              ref={statusMenuRef}
              role="menu"
              aria-label="Смена статуса сессии"
              className="fixed z-[140] min-w-[160px] rounded-lg border border-border bg-panel py-1 shadow-panel"
              style={{ top: statusMenuPos.top, left: statusMenuPos.left }}
              onKeyDown={handleStatusMenuKeyDown}
              data-testid="session-status-menu"
            >
              {statusOptions.map((option) => {
                const optionStyle = STATUS_CHIP_STYLES[option.value] || STATUS_CHIP_STYLES.draft;
                const selected = option.value === normalizedStatus;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected ? "true" : "false"}
                    onClick={() => {
                      setStatusMenuOpen(false);
                      onChangeStatus?.(option.value);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accentSoft/40 focus:outline-none focus-visible:bg-accentSoft/50 ${selected ? "font-semibold text-fg" : "text-fg/85"}`}
                    data-testid={`session-status-option-${option.value}`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: optionStyle.dot }} aria-hidden />
                    <span className="flex-1">{option.label}</span>
                    <span className="w-3 text-accent" aria-hidden>{selected ? "✓" : ""}</span>
                  </button>
                );
              })}
            </span>,
            document.body,
          )
        ) : null}
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
