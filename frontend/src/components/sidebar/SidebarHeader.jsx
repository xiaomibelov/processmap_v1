import { useEffect, useRef, useState } from "react";
import AppRouteLink from "../navigation/AppRouteLink";
import { buildAppWorkspaceHref } from "../../features/navigation/appLinkBehavior";

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
  projectId,
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const projectHref = buildAppWorkspaceHref({ projectId });
  const sessionHref = buildAppWorkspaceHref({ projectId, sessionId });

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
        <AppRouteLink
          className="sidebarBreadcrumbBtn"
          href={projectHref}
          title={projectTitle || "Проект"}
          onNavigate={() => onProjectBreadcrumbClick?.()}
        >
          {projectTitle || "Проект"}
        </AppRouteLink>
        <span className="sidebarBreadcrumbSep">/</span>
        <AppRouteLink
          className="sidebarBreadcrumbBtn"
          href={sessionHref}
          title={sessionTitle || sessionId || "Сессия"}
          onNavigate={() => onSessionBreadcrumbClick?.()}
        >
          {sessionTitle || sessionId || "Сессия"}
        </AppRouteLink>
        <span className="sidebarBreadcrumbSep">/</span>
        <button
          type="button"
          className="sidebarBreadcrumbBtn"
          title={processTitle || "Процесс"}
          onClick={() => onProcessBreadcrumbClick?.()}
        >
          {processTitle || "Процесс"}
        </button>
      </div>
    </div>
  );
}
