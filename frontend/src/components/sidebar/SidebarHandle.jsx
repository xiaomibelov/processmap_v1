import { getSidebarSectionMeta, SidebarSectionGlyph } from "./sectionVisuals";

export default function SidebarHandle({
  onClick,
  sections = [],
  title = "Открыть панель",
  disabled = false,
}) {
  const items = Array.isArray(sections) ? sections.slice(0, 5) : [];
  return (
    <div className="leftSidebarHandleRail" data-testid="left-sidebar-handle">
      <button
        type="button"
        className={`leftSidebarHandleOpenBtn ${disabled ? "isDisabled" : ""}`}
        onClick={() => {
          if (disabled) return;
          onClick?.("open");
        }}
        title={title}
        aria-label={title}
        disabled={disabled}
      >
        <span className="leftSidebarHandleIcon">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M3 4.2h10M3 8h10M3 11.8h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <div className="leftSidebarHandleList">
        {items.map((section) => {
          const id = String(section?.id || "").trim();
          const meta = getSidebarSectionMeta(id);
          const isActive = !!section?.active && !section?.muted;
          const isMuted = !!section?.muted;
          return (
          <button
            key={id || String(section?.title || "section")}
            type="button"
            className={`leftSidebarHandleMini leftSidebarHandleMini--${meta.tone} ${isActive ? "isActive" : ""} ${isMuted ? "isMuted" : ""}`}
            onClick={() => onClick?.(id || "open")}
            title={String(section?.title || meta.title || "Открыть панель")}
            aria-label={String(section?.title || meta.title || "Открыть панель")}
            disabled={isMuted}
            style={{ "--sidebar-accent": String(meta.accent || "220 20% 56%") }}
          >
            <span className={`leftSidebarHandleMiniStripe leftSidebarHandleMiniStripe--${meta.tone}`} aria-hidden="true" />
            <span className="leftSidebarHandleMiniLabel">
              <SidebarSectionGlyph sectionId={id} className="h-3.5 w-3.5" />
            </span>
            {Number(section?.count || 0) > 0 ? (
              <span className={`leftSidebarHandleMiniCount leftSidebarHandleMiniCount--${meta.tone}`}>{Number(section?.count || 0)}</span>
            ) : null}
          </button>
          );
        })}
      </div>
    </div>
  );
}
