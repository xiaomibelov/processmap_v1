import { CONTEXT_MENU_GROUP_META } from "./contextMenuGroups";

function toText(value) {
  return String(value || "").trim();
}

export default function BpmnContextMenuQuickField({
  quickLabel,
  quickPlaceholder,
  quickDraft,
  onChange,
  onKeyDown,
  onBlur,
  inputRef,
}) {
  const quickSectionMeta = CONTEXT_MENU_GROUP_META.quick_properties;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${quickSectionMeta.dotClass}`} />
        <span>{quickSectionMeta.title}</span>
      </div>
      <div className="rounded-md border border-border/70 bg-panel2/45 p-1">
        <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted" htmlFor="bpmn-context-menu-quick-input">
          {toText(quickLabel)}
        </label>
        <input
          id="bpmn-context-menu-quick-input"
          ref={inputRef}
          className="input h-7 min-h-0 w-full min-w-0 text-[11px]"
          placeholder={toText(quickPlaceholder) || "Введите значение"}
          value={String(quickDraft ?? "")}
          onChange={(event) => onChange?.(String(event?.target?.value ?? ""))}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          data-testid="bpmn-context-menu-quick-input"
        />
      </div>
    </div>
  );
}

