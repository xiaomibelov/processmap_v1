export default function AdvancedSettingsSection({
  count,
  open,
  onToggle,
  children,
  onSaveAll,
  onResetAll,
  disabled = false,
  busy = false,
  extensionStateBusy = false,
  bpmnDocumentationBusy = false,
  hideActions = false,
}) {
  return (
    <section
      className={`sidebarPropertiesSection ${open ? "sidebarPropertiesSection--open" : ""} sidebarPropertiesSection--advanced`}
      data-testid="advanced-settings-section"
    >
      <div className="sidebarPropertiesSectionHead">
        <button
          type="button"
          className="sidebarPropertiesSectionToggle"
          onClick={() => onToggle((prev) => !prev)}
          aria-expanded={open ? "true" : "false"}
        >
          <span className="sidebarPropertiesSectionChevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className="sidebarPropertiesSectionTitle">Расширенные настройки</span>
          <span className="sidebarPropertiesSectionMeta">{count}</span>
        </button>
      </div>
      {open ? (
        <div className="sidebarPropertiesSectionBody">
          {children}
          {!hideActions ? (
            <div className="sidebarPropertiesFooter sidebarPropertiesFooter--sticky sidebarButtonRow">
              <button
                type="button"
                className="primaryBtn sidebarPropertiesActionBtn flex-1"
                onClick={onSaveAll}
                disabled={!!disabled || !!busy || !!extensionStateBusy || !!bpmnDocumentationBusy}
              >
                {busy || extensionStateBusy || bpmnDocumentationBusy ? "Сохраняю..." : "Сохранить всё"}
              </button>
              <button
                type="button"
                className="secondaryBtn sidebarPropertiesActionBtn px-3"
                onClick={onResetAll}
                disabled={!!disabled || !!busy || !!extensionStateBusy || !!bpmnDocumentationBusy}
              >
                Сбросить
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
