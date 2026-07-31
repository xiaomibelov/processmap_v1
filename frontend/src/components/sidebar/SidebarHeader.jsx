import { useEffect, useRef, useState } from "react";

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

export default function SidebarHeader({
  processTitle,
  projectTitle,
  sessionTitle,
  sessionId,
  onProjectBreadcrumbClick,
  onSessionBreadcrumbClick,
  onProcessBreadcrumbClick,
  onRenameProject,
  onDeleteProject,
  onRenameSession,
  onDeleteSession,
  onToggleCollapse,
  onCloseSidebar,
  dockSide = "left",
  onToggleDockSide,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const onClose = onCloseSidebar || onToggleCollapse;

  return (
    <div className="sidebarContextHeader">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="sidebarSectionCaption">Контекст процесса</div>
        <div className="relative inline-flex items-center gap-1">
          <button
            ref={buttonRef}
            type="button"
            className="sidebarIconBtn"
            title="Действия"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Действия"
            aria-expanded={menuOpen ? "true" : "false"}
          >
            ⋯
          </button>
          {typeof onToggleDockSide === "function" ? (
            <button
              type="button"
              className="sidebarIconBtn"
              title={dockSide === "right" ? "Переместить панель налево" : "Переместить панель направо"}
              aria-label={dockSide === "right" ? "Переместить панель налево" : "Переместить панель направо"}
              data-testid="sidebar-dock-toggle"
              onClick={() => onToggleDockSide?.()}
            >
              {dockSide === "right" ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M2 2.5v11M2 8h8.5M7.5 4.8 10.7 8l-3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className={"h-3.5 w-3.5"} aria-hidden="true">
                  <path d="M14 2.5v11M14 8H5.5M8.5 4.8 5.3 8l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ) : null}
          {menuOpen ? (
            <div ref={menuRef} className="sidebarHeaderMenu">
              {typeof onRenameProject === "function" ? (
                <button type="button" className="sidebarHeaderMenuItem" onClick={() => { setMenuOpen(false); onRenameProject?.(); }}>
                  Переименовать проект
                </button>
              ) : null}
              {typeof onDeleteProject === "function" ? (
                <button type="button" className="sidebarHeaderMenuItem isDanger" onClick={() => { setMenuOpen(false); onDeleteProject?.(); }}>
                  Удалить проект
                </button>
              ) : null}
              {typeof onRenameSession === "function" ? (
                <button type="button" className="sidebarHeaderMenuItem" onClick={() => { setMenuOpen(false); onRenameSession?.(); }}>
                  Переименовать сессию
                </button>
              ) : null}
              {typeof onDeleteSession === "function" ? (
                <button type="button" className="sidebarHeaderMenuItem isDanger" onClick={() => { setMenuOpen(false); onDeleteSession?.(); }}>
                  Удалить сессию
                </button>
              ) : null}
              <button
                type="button"
                className="sidebarHeaderMenuItem"
                onClick={() => {
                  setMenuOpen(false);
                  void copyText(sessionId);
                }}
              >
                Копировать session id
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebarIconBtn"
            title="Скрыть панель"
            onClick={() => onClose?.()}
            aria-label="Скрыть панель"
          >
            <span className="font-mono">⟨</span>
          </button>
        </div>
      </div>

      <div className="sidebarBreadcrumbRow">
        {/* A8: крошки — только реальные переходы. Проект → список сессий
            проекта; текущая сессия — текст (мы уже здесь). */}
        <button
          type="button"
          className="sidebarBreadcrumbBtn"
          title={`К списку сессий проекта «${projectTitle || "Проект"}»`}
          data-testid="breadcrumb-project"
          onClick={() => onProjectBreadcrumbClick?.()}
        >
          {projectTitle || "Проект"}
        </button>
        <span className="sidebarBreadcrumbSep">/</span>
        <span
          className="sidebarBreadcrumbCurrent"
          title={sessionTitle || sessionId || "Сессия"}
          data-testid="breadcrumb-session"
        >
          {sessionTitle || sessionId || "Сессия"}
        </span>
      </div>
    </div>
  );
}
