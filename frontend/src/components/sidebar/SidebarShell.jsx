import { useEffect, useRef, useState } from "react";
import { getSidebarSectionMeta, SidebarSectionGlyph } from "./sectionVisuals";

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

function SidebarHeader({
  processTitle,
  projectTitle,
  sessionTitle,
  projectId,
  sessionId,
  selectedNodeId,
  aiBadgeCount,
  notesBadgeCount,
  actorsBadgeCount,
  onProjectBreadcrumbClick,
  onSessionBreadcrumbClick,
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
    <div className="leftSidebarHeader sticky top-0 z-20 border-b border-border bg-panel/95 px-3 py-2 backdrop-blur">
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="sidebarBreadcrumbRow">
            <button
              type="button"
              className="sidebarBreadcrumbBtn"
              title={projectTitle || "Проект"}
              onClick={() => onProjectBreadcrumbClick?.()}
            >
              {projectTitle || "Проект"}
            </button>
            <span className="sidebarBreadcrumbSep">/</span>
            <button
              type="button"
              className="sidebarBreadcrumbBtn"
              title={sessionTitle || sessionId || "Сессия"}
              onClick={() => onSessionBreadcrumbClick?.()}
            >
              {sessionTitle || sessionId || "Сессия"}
            </button>
          </div>
          <div className="truncate text-sm font-semibold text-fg" title={processTitle || "—"}>
            {processTitle || "—"}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            {projectId ? <span className="sidebarBadge">project {projectId}</span> : null}
            {sessionId ? <span className="sidebarBadge">session {sessionId}</span> : null}
            {selectedNodeId ? <span className="sidebarBadge">node {selectedNodeId}</span> : null}
            <span className="sidebarBadge">AI {Number(aiBadgeCount || 0)}</span>
            <span className="sidebarBadge">Notes {Number(notesBadgeCount || 0)}</span>
            <span className="sidebarBadge">Actors {Number(actorsBadgeCount || 0)}</span>
            <button
              type="button"
              className="sidebarIconBtn"
              title="Копировать session id"
              onClick={() => {
                void copyText(sessionId);
              }}
            >
              ID
            </button>
          </div>
        </div>
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
              <button type="button" className="sidebarHeaderMenuItem" onClick={() => { setMenuOpen(false); onRenameProject?.(); }}>
                Переименовать проект
              </button>
              <button type="button" className="sidebarHeaderMenuItem isDanger" onClick={() => { setMenuOpen(false); onDeleteProject?.(); }}>
                Удалить проект
              </button>
              <button type="button" className="sidebarHeaderMenuItem" onClick={() => { setMenuOpen(false); onRenameSession?.(); }}>
                Переименовать сессию
              </button>
              <button type="button" className="sidebarHeaderMenuItem isDanger" onClick={() => { setMenuOpen(false); onDeleteSession?.(); }}>
                Удалить сессию
              </button>
            </div>
          ) : null}
        </div>
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
  );
}

export default function SidebarShell({
  processTitle,
  projectTitle,
  sessionTitle,
  projectId,
  sessionId,
  selectedNodeId,
  aiBadgeCount,
  notesBadgeCount,
  actorsBadgeCount,
  collapsed,
  onProjectBreadcrumbClick,
  onSessionBreadcrumbClick,
  onRenameProject,
  onDeleteProject,
  onRenameSession,
  onDeleteSession,
  onToggleCollapse,
  onCloseSidebar,
  sections,
  onSectionShortcut,
  stickyContent,
  bottomBar,
  children,
}) {
  useEffect(() => {
    if (collapsed) return undefined;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      onCloseSidebar?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed, onCloseSidebar]);

  if (collapsed) {
    return (
      <aside className="leftSidebarShell flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-panel/95">
        <div className="leftSidebarHeader sticky top-0 z-20 border-b border-border bg-panel/95 px-2 py-2 backdrop-blur">
          <button
            type="button"
            className="sidebarIconBtn w-full justify-center"
            title="Развернуть панель"
            onClick={() => onToggleCollapse?.()}
            aria-label="Развернуть панель"
          >
            <SidebarSectionGlyph sectionId="selected" className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
        <div className="leftSidebarRail flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-2">
          {(Array.isArray(sections) ? sections : []).map((section) => {
            const id = String(section?.id || "").trim();
            const meta = getSidebarSectionMeta(id);
            const isActive = !!section?.active;
            const isMuted = !!section?.muted;
            return (
              <div
                key={id || section.title}
                className={`sidebarRailItem ${isActive ? "isActive" : ""} ${isMuted ? "isMuted" : ""}`}
                style={{ "--sidebar-accent": String(meta.accent || "220 20% 56%") }}
              >
                <span className={`sidebarRailActiveStripe sidebarRailActiveStripe--${meta.tone}`} aria-hidden="true" />
                <button
                  type="button"
                  className={`sidebarRailBtn sidebarRailBtn--${meta.tone} ${isActive ? "isActive" : ""}`}
                  title={section.title}
                  onClick={() => onSectionShortcut?.(id)}
                  aria-label={section.title}
                  disabled={isMuted}
                >
                  <SidebarSectionGlyph sectionId={id} className="h-3.5 w-3.5" />
                </button>
                {Number(section?.count || 0) > 0 ? (
                  <span className={`sidebarRailBadge sidebarRailBadge--${meta.tone}`}>{Number(section.count || 0)}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="leftSidebarShell flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-panel/95">
      <SidebarHeader
        processTitle={processTitle}
        projectTitle={projectTitle}
        sessionTitle={sessionTitle}
        projectId={projectId}
        sessionId={sessionId}
        selectedNodeId={selectedNodeId}
        aiBadgeCount={aiBadgeCount}
        notesBadgeCount={notesBadgeCount}
        actorsBadgeCount={actorsBadgeCount}
        onProjectBreadcrumbClick={onProjectBreadcrumbClick}
        onSessionBreadcrumbClick={onSessionBreadcrumbClick}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
        onToggleCollapse={onToggleCollapse}
        onCloseSidebar={onCloseSidebar}
      />
      {Array.isArray(sections) && sections.length ? (
        <div className="sidebarQuickNav border-b border-border/70 px-3 py-1.5">
          {sections.map((section) => {
            const id = String(section?.id || "").trim();
            const meta = getSidebarSectionMeta(id);
            return (
            <button
              key={id || section.title}
              type="button"
              className={`sidebarQuickNavBtn sidebarQuickNavBtn--${meta.tone} ${section?.active ? "isActive" : ""}`}
              onClick={() => onSectionShortcut?.(id)}
              title={section.title}
              style={{ "--sidebar-accent": String(meta.accent || "220 20% 56%") }}
            >
              <SidebarSectionGlyph sectionId={id} className="h-3.5 w-3.5" />
              <span>{section.id === "selected" ? "УЗЕЛ" : String(section.id || "").toUpperCase()}</span>
              {Number(section?.count || 0) > 0 ? (
                <span className="sidebarQuickNavBadge">{Number(section.count || 0)}</span>
              ) : null}
            </button>
            );
          })}
        </div>
      ) : null}
      {stickyContent ? <div className="leftSidebarSticky border-b border-border/70 bg-panel/92 px-3 py-2.5">{stickyContent}</div> : null}
      <div className="leftSidebarBody min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      {bottomBar ? <div className="leftSidebarBottom border-t border-border/70 bg-panel/96 px-3 py-2">{bottomBar}</div> : null}
    </aside>
  );
}
