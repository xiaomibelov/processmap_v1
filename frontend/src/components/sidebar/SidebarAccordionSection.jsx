export default function SidebarAccordionSection({
  sectionKey,
  title,
  subtitle = "",
  badge = "",
  open,
  onToggle,
  children,
}) {
  return (
    <section className={`sidebarAccordion ${open ? "isOpen" : ""}`} data-section-id={sectionKey}>
      <button
        type="button"
        className="sidebarAccordionHead"
        onClick={() => onToggle?.(sectionKey)}
        aria-expanded={open ? "true" : "false"}
      >
        <div className="min-w-0">
          <div className="sidebarAccordionTitleRow">
            <span className="sidebarAccordionTitle">{title}</span>
            {badge ? <span className="sidebarAccordionBadge">{badge}</span> : null}
          </div>
          {subtitle ? <div className="sidebarAccordionSubtitle">{subtitle}</div> : null}
        </div>
        <span className="sidebarAccordionToggle">{open ? "Свернуть" : "Развернуть"}</span>
      </button>
      {open ? <div className="sidebarAccordionBody">{children}</div> : null}
    </section>
  );
}
