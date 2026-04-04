import { useCallback } from "react";
import BpmnContextMenuActionSection from "./ui/BpmnContextMenuActionSection";
import BpmnContextMenuQuickField from "./ui/BpmnContextMenuQuickField";
import { groupContextMenuActions } from "./ui/contextMenuGroups";
import useBpmnContextMenuPosition from "./ui/useBpmnContextMenuPosition";
import useBpmnQuickEditController from "./ui/useBpmnQuickEditController";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export default function BpmnDiagramContextMenu({
  menu,
  onAction,
  onClose,
}) {
  const actions = asArray(menu?.actions);
  const groups = groupContextMenuActions(actions);
  const {
    menuRef,
    pos,
  } = useBpmnContextMenuPosition({
    menu,
    reflowKey: `${groups.length}:${toText(menu?.target?.id)}:${toText(menu?.quickEdit?.actionId)}`,
  });
  const quick = useBpmnQuickEditController({
    menu,
    onAction,
  });

  const runAction = useCallback(async (actionId, options = {}) => {
    if (typeof onAction !== "function") return null;
    return await Promise.resolve(
      onAction({
        actionId: toText(actionId),
        closeOnSuccess: options.closeOnSuccess !== false,
        value: String(options.value ?? ""),
      }),
    );
  }, [onAction]);

  if (!menu || !groups.length) return null;

  return (
    <div
      ref={menuRef}
      className="diagramActionPopover"
      style={{
        position: "fixed",
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        zIndex: 42,
        minWidth: "232px",
        maxWidth: "300px",
        maxHeight: "calc(100vh - 16px)",
        overflowY: "auto",
      }}
      data-testid="bpmn-context-menu"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="diagramActionPopoverHead">
        <span className="truncate">{toText(menu?.header) || "Элемент BPMN"}</span>
        <button
          type="button"
          className="secondaryBtn h-6 px-1.5 text-[10px]"
          onClick={onClose}
          data-testid="bpmn-context-menu-close"
        >
          Закрыть
        </button>
      </div>
      <div className="diagramIssueRows">
        {quick.hasQuickEdit ? (
          <BpmnContextMenuQuickField
            quickLabel={quick.quickLabel}
            quickPlaceholder={quick.quickPlaceholder}
            quickDraft={quick.quickDraft}
            onChange={quick.setQuickDraft}
            onKeyDown={quick.onInputKeyDown}
            onBlur={quick.onInputBlur}
            inputRef={quick.inputRef}
          />
        ) : null}
        {groups.map((row) => (
          <BpmnContextMenuActionSection
            key={`bpmn_ctx_group_${row.group}`}
            group={row.group}
            items={row.items}
            onAction={async (actionId) => {
              await runAction(actionId, { closeOnSuccess: true });
            }}
          />
        ))}
      </div>
    </div>
  );
}

