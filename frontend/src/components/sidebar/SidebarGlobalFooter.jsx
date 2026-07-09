export default function SidebarGlobalFooter({
  disabled,
  extensionStateBusy,
  bpmnDocumentationBusy,
  onSaveAll,
  onResetAll,
}) {
  return (
    <div className="sidebarPropertiesFooter sidebarPropertiesFooter--sticky sidebarButtonRow">
      <button
        type="button"
        className="primaryBtn sidebarPropertiesActionBtn flex-1"
        onClick={onSaveAll}
        disabled={!!disabled || !!extensionStateBusy || !!bpmnDocumentationBusy}
      >
        {extensionStateBusy || bpmnDocumentationBusy ? "Сохраняю..." : "Сохранить всё"}
      </button>
      <button
        type="button"
        className="secondaryBtn sidebarPropertiesActionBtn px-3"
        onClick={onResetAll}
        disabled={!!disabled || !!extensionStateBusy || !!bpmnDocumentationBusy}
      >
        Сбросить
      </button>
    </div>
  );
}
