import React from "react";

const GROUP_ORDER = ["primary", "structural", "utility", "destructive"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function resolveMenuPosition(menu) {
  const x = Number(menu?.clientX || 0);
  const y = Number(menu?.clientY || 0);
  if (typeof window === "undefined") return { left: x, top: y };
  const maxLeft = Math.max(16, Number(window.innerWidth || 0) - 260);
  const maxTop = Math.max(16, Number(window.innerHeight || 0) - 320);
  return {
    left: Math.max(8, Math.min(Math.round(x), maxLeft)),
    top: Math.max(8, Math.min(Math.round(y), maxTop)),
  };
}

function groupActions(actionsRaw) {
  const actions = asArray(actionsRaw);
  const byGroup = {};
  GROUP_ORDER.forEach((group) => {
    byGroup[group] = actions.filter((item) => toText(item?.group) === group);
  });
  return GROUP_ORDER.filter((group) => byGroup[group].length > 0)
    .map((group) => ({ group, items: byGroup[group] }));
}

export default function BpmnDiagramContextMenu({
  menu,
  onAction,
  onClose,
}) {
  if (!menu || !Array.isArray(menu?.actions) || menu.actions.length === 0) return null;
  const groups = groupActions(menu.actions);
  if (!groups.length) return null;

  const pos = resolveMenuPosition(menu);
  return (
    <div
      className="diagramActionPopover"
      style={{
        position: "fixed",
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        zIndex: 42,
        minWidth: "228px",
        maxWidth: "280px",
      }}
      data-testid="bpmn-context-menu"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="diagramActionPopoverHead">
        <span>{toText(menu?.header) || "BPMN"}</span>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onClose}
          data-testid="bpmn-context-menu-close"
        >
          Close
        </button>
      </div>
      <div className="diagramIssueRows">
        {groups.map((row, index) => (
          <React.Fragment key={`bpmn_ctx_group_${row.group}`}>
            {index > 0 ? <div className="my-1 h-px bg-white/10" /> : null}
            <div className="flex flex-col gap-1">
              {row.items.map((item) => (
                <button
                  key={`bpmn_ctx_action_${toText(item.id)}`}
                  type="button"
                  className={`secondaryBtn h-7 justify-start px-2 text-left text-[11px] ${
                    item?.destructive ? "text-red-300 hover:text-red-200" : ""
                  }`}
                  onClick={() => onAction?.(toText(item.id), item)}
                  data-testid={`bpmn-context-menu-action-${toText(item.id)}`}
                >
                  {toText(item.label) || toText(item.id)}
                </button>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

