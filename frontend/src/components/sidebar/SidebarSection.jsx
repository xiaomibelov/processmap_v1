import { getSidebarSectionMeta, SidebarSectionGlyph } from "./sectionVisuals";

export default function SidebarSection({
  sectionId,
  title,
  summary,
  badge,
  open,
  onToggle,
  children,
}) {
  const meta = getSidebarSectionMeta(sectionId);
  return (
    <section
      className={`sidebarSection sidebarSectionPanel sidebarSectionPanel--${meta.tone}`}
      data-section-id={sectionId}
      style={{ "--sidebar-accent": String(meta.accent || "220 20% 56%") }}
    >
      <div className="sidebarSectionStripe" aria-hidden="true" />
      <button
        type="button"
        className={`sidebarSectionHead sidebarSectionHead--${meta.tone} group w-full px-3 py-2.5 text-left`}
        onClick={() => onToggle?.(sectionId)}
        aria-expanded={open ? "true" : "false"}
      >
        <div className="flex items-center gap-2">
          <span className="sidebarSectionIcon" aria-hidden="true">
            <SidebarSectionGlyph sectionId={sectionId} className="h-3.5 w-3.5" />
          </span>
          <div className={`sidebarSectionTitle sidebarSectionTitle--${meta.tone} text-sm font-semibold`}>{title}</div>
          {badge ? <span className={`sidebarBadge sidebarBadge--${meta.tone}`}>{badge}</span> : null}
          <span className="ml-auto text-xs text-muted transition-colors group-hover:text-fg">
            {open ? "Свернуть" : "Развернуть"}
          </span>
          <span
            className="sidebarDragHandle"
            data-sidebar-drag-handle="1"
            title="Перетащить секцию"
            aria-hidden="true"
            onMouseDown={(event) => {
              event.stopPropagation();
              const host = event.currentTarget?.closest?.("[data-sidebar-draggable-id]");
              if (host instanceof HTMLElement) host.dataset.dragArmed = "1";
            }}
            onMouseUp={(event) => {
              const host = event.currentTarget?.closest?.("[data-sidebar-draggable-id]");
              if (host instanceof HTMLElement) host.dataset.dragArmed = "0";
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <svg viewBox="0 0 12 12" className="h-3.5 w-3.5">
              <circle cx="4" cy="3" r="0.9" fill="currentColor" />
              <circle cx="8" cy="3" r="0.9" fill="currentColor" />
              <circle cx="4" cy="6" r="0.9" fill="currentColor" />
              <circle cx="8" cy="6" r="0.9" fill="currentColor" />
              <circle cx="4" cy="9" r="0.9" fill="currentColor" />
              <circle cx="8" cy="9" r="0.9" fill="currentColor" />
            </svg>
          </span>
        </div>
        {summary ? (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted">
            <span className={`sidebarSummaryDot sidebarSummaryDot--${meta.tone}`} aria-hidden="true" />
            <span>{summary}</span>
          </div>
        ) : null}
      </button>
      {open ? <div className="sidebarSectionBody px-3 pb-3">{children}</div> : null}
    </section>
  );
}
