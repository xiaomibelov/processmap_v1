import { useEffect } from "react";
import SidebarHeader from "./SidebarHeader";
import { getSidebarSectionMeta, SidebarSectionGlyph } from "./sectionVisuals";

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
  onProcessBreadcrumbClick,
  onRenameProject,
  onDeleteProject,
  onRenameSession,
  onDeleteSession,
  tierLabel,
  onToggleCollapse,
  onCloseSidebar,
  sections,
  showQuickNav = false,
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
      <aside className="leftSidebarShell flex h-full min-h-0 flex-col overflow-hidden">
        <div className="leftSidebarHeader sticky top-0 z-20 px-2 py-2">
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
    <aside className="leftSidebarShell flex h-full min-h-0 flex-col overflow-hidden">
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
        onProcessBreadcrumbClick={onProcessBreadcrumbClick}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
        tierLabel={tierLabel}
        onToggleCollapse={onToggleCollapse}
        onCloseSidebar={onCloseSidebar}
      />
      {showQuickNav && Array.isArray(sections) && sections.length ? (
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
      {stickyContent ? <div className="leftSidebarSticky px-3 py-2.5">{stickyContent}</div> : null}
      <div className="leftSidebarBody min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      {bottomBar ? <div className="leftSidebarBottom px-3 py-2">{bottomBar}</div> : null}
    </aside>
  );
}
