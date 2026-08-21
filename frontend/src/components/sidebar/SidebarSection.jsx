import SidebarInfoTip from "./SidebarInfoTip";

export default function SidebarSection({
  title,
  count,
  open,
  onToggle,
  infoLabel,
  infoText,
  children,
  className = "",
  dataTestId,
}) {
  return (
    <section
      className={`sidebarPropertiesSection ${open ? "sidebarPropertiesSection--open" : ""} ${className}`}
      data-testid={dataTestId}
    >
      <div className="sidebarPropertiesSectionHead">
        <button
          type="button"
          className="sidebarPropertiesSectionToggle"
          onClick={() => onToggle((prev) => !prev)}
          aria-expanded={open ? "true" : "false"}
        >
          <span className="sidebarPropertiesSectionChevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className="sidebarPropertiesSectionTitle">{title}</span>
          <span className="sidebarPropertiesSectionMeta">{count}</span>
        </button>
        {infoLabel ? (
          <SidebarInfoTip label={infoLabel} text={infoText} />
        ) : null}
      </div>
      {open ? <div className="sidebarPropertiesSectionBody">{children}</div> : null}
    </section>
  );
}
