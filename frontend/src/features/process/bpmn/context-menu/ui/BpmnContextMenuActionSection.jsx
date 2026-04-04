import { CONTEXT_MENU_GROUP_META } from "./contextMenuGroups";

function toText(value) {
  return String(value || "").trim();
}

export default function BpmnContextMenuActionSection({
  group,
  items,
  onAction,
}) {
  const meta = CONTEXT_MENU_GROUP_META[group] || { title: "Действия", dotClass: "bg-muted/70" };
  return (
    <>
      <div className="my-0.5 h-px bg-white/10" />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
          <span>{meta.title}</span>
        </div>
        {items.map((item) => (
          <button
            key={`bpmn_ctx_action_${toText(item.id)}`}
            type="button"
            className={`secondaryBtn h-6 justify-start rounded-md border-border/70 px-1.5 text-left text-[10px] ${
              item?.destructive ? "text-red-300 hover:text-red-200" : ""
            } ${item?.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={item?.disabled === true}
            onClick={async () => {
              if (item?.disabled === true) return;
              await onAction?.(toText(item.id));
            }}
            data-testid={`bpmn-context-menu-action-${toText(item.id)}`}
          >
            {toText(item.label) || toText(item.id)}
          </button>
        ))}
      </div>
    </>
  );
}

