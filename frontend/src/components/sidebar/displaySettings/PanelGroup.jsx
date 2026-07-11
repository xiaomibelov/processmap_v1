// Collapsible sub-group for the Properties tab (property-panel-redesign,
// UI refresh). Header = toggle button (chevron + uppercase label) plus an
// optional right slot (pills, counters). Body renders only when open so
// collapsed groups cost zero layout. State/persistence lives in
// panelGroupsModel.js + usePanelGroupsState.js — this component is pure UI.

export default function PanelGroup({
  groupId,
  label,
  open = true,
  onToggle,
  right = null,
  className = "",
  children,
}) {
  return (
    <div className={`panelGroup ${className}`.trim()} data-group={groupId}>
      <div className="panelGroupHead">
        <button
          type="button"
          className="panelGroupToggle"
          aria-expanded={!!open}
          onClick={() => onToggle?.(groupId)}
          data-testid={`panel-group-toggle-${groupId}`}
        >
          <span
            className={open ? "panelGroupChevron panelGroupChevron--open" : "panelGroupChevron"}
            aria-hidden="true"
          >
            ▾
          </span>
          <span className="overlayDisplayLabel">{label}</span>
        </button>
        {right ? <div className="panelGroupRight">{right}</div> : null}
      </div>
      {open && <div className="panelGroupBody">{children}</div>}
    </div>
  );
}
