import { memo } from "react";

function ChevronIcon({ className }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function SidebarAccordionSection({
  sectionKey,
  title,
  subtitle = "",
  badge = "",
  headerRight = null,
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
        <div className="min-w-0 flex-1">
          <div className="sidebarAccordionTitleRow">
            <span className="sidebarAccordionTitle">{title}</span>
            {badge ? <span className="sidebarAccordionBadge">{badge}</span> : null}
          </div>
          {subtitle ? <div className="sidebarAccordionSubtitle">{subtitle}</div> : null}
        </div>
        {headerRight ? (
          // Non-interactive status slot (e.g. the extension-state mini
          // indicator). Clicks must not toggle the accordion.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
          <span className="sidebarAccordionHeaderRight" onClick={(event) => event.stopPropagation()}>
            {headerRight}
          </span>
        ) : null}
        <ChevronIcon className={`sidebarAccordionChevron ${open ? "isOpen" : ""}`} />
      </button>
      <div className="sidebarAccordionBodyWrap">
        <div className="sidebarAccordionBody">
          {children}
        </div>
      </div>
    </section>
  );
}

export default memo(SidebarAccordionSection);
