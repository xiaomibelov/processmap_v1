import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CONTEXT_MENU_GROUP_META } from "./contextMenuGroups";

function toText(value) {
  return String(value || "").trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

const COPY_ACTION_IDS = new Set(["copy_element", "copy_name", "copy_id"]);

function isCopyActionItem(itemRaw) {
  const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
  return COPY_ACTION_IDS.has(toText(item.id));
}

function ActionButton({
  item,
  onAction,
  extraClassName = "",
}) {
  return (
    <button
      type="button"
      className={`secondaryBtn h-6 w-full justify-start rounded-md border-border/70 px-1.5 text-left text-[10px] ${
        item?.destructive ? "text-red-300 hover:text-red-200" : ""
      } ${item?.disabled ? "opacity-50 cursor-not-allowed" : ""} ${extraClassName}`.trim()}
      disabled={item?.disabled === true}
      onClick={async () => {
        if (item?.disabled === true) return;
        await onAction?.(toText(item.id));
      }}
      data-testid={`bpmn-context-menu-action-${toText(item.id)}`}
    >
      {toText(item.label) || toText(item.id)}
    </button>
  );
}

export default function BpmnContextMenuActionSection({
  group,
  items,
  onAction,
}) {
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copyMenuPlacement, setCopyMenuPlacement] = useState("right");
  const [copyMenuViewportStyle, setCopyMenuViewportStyle] = useState(null);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const submenuRef = useRef(null);
  const meta = CONTEXT_MENU_GROUP_META[group] || { title: "Действия", dotClass: "bg-muted/70" };
  const normalizedItems = Array.isArray(items) ? items : [];
  const shouldRenderCopySubmenu = group === "service";
  const copyItems = shouldRenderCopySubmenu
    ? normalizedItems.filter(isCopyActionItem)
    : [];
  const directItems = shouldRenderCopySubmenu
    ? normalizedItems.filter((item) => !isCopyActionItem(item))
    : normalizedItems;

  const resolveInteractiveContainment = useCallback((target) => {
    if (!target || typeof target !== "object") return false;
    const wrapperNode = wrapperRef.current;
    const submenuNode = submenuRef.current;
    return !!(
      (wrapperNode && wrapperNode.contains(target))
      || (submenuNode && submenuNode.contains(target))
    );
  }, []);

  const updateCopyMenuViewportStyle = useCallback(() => {
    if (!copyMenuOpen || typeof window === "undefined") return;
    const triggerNode = triggerRef.current;
    if (!triggerNode) return;
    const triggerRect = triggerNode.getBoundingClientRect();
    const submenuRect = submenuRef.current?.getBoundingClientRect?.() || {};
    const submenuWidth = Math.max(168, Math.round(Number(submenuRect.width || 0) || 0));
    const submenuHeight = Math.max(1, Math.round(Number(submenuRect.height || 0) || 0));
    const gap = 4;
    const viewportPadding = 8;
    const viewportWidth = Number(window.innerWidth || 0);
    const viewportHeight = Number(window.innerHeight || 0);
    const rightSpace = viewportWidth - triggerRect.right - viewportPadding;
    const leftSpace = triggerRect.left - viewportPadding;
    const placement = rightSpace >= submenuWidth + gap || rightSpace >= leftSpace ? "right" : "left";
    const unclampedLeft = placement === "right"
      ? triggerRect.right + gap
      : triggerRect.left - submenuWidth - gap;
    const maxLeft = Math.max(viewportPadding, viewportWidth - submenuWidth - viewportPadding);
    const maxTop = Math.max(viewportPadding, viewportHeight - submenuHeight - viewportPadding);
    setCopyMenuPlacement(placement);
    setCopyMenuViewportStyle({
      position: "fixed",
      left: `${clamp(Math.round(unclampedLeft), viewportPadding, maxLeft)}px`,
      top: `${clamp(Math.round(triggerRect.top), viewportPadding, maxTop)}px`,
      zIndex: 96,
    });
  }, [copyMenuOpen]);

  useLayoutEffect(() => {
    updateCopyMenuViewportStyle();
  }, [copyMenuOpen, copyItems.length, updateCopyMenuViewportStyle]);

  useLayoutEffect(() => {
    if (!copyMenuOpen || typeof window === "undefined") return undefined;
    const rafId = window.requestAnimationFrame(() => {
      updateCopyMenuViewportStyle();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [copyMenuOpen, updateCopyMenuViewportStyle]);

  useEffect(() => {
    if (!copyMenuOpen || typeof window === "undefined") return undefined;
    const onViewportChange = () => updateCopyMenuViewportStyle();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [copyMenuOpen, updateCopyMenuViewportStyle]);

  return (
    <>
      <div className="my-0.5 h-px bg-white/10" />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
          <span>{meta.title}</span>
        </div>
        {directItems.map((item) => (
          <ActionButton
            key={`bpmn_ctx_action_${toText(item.id)}`}
            item={item}
            onAction={onAction}
          />
        ))}
        {copyItems.length > 0 ? (
          <div
            ref={wrapperRef}
            className="relative"
            onMouseEnter={() => setCopyMenuOpen(true)}
            onMouseLeave={(event) => {
              if (resolveInteractiveContainment(event.relatedTarget)) return;
              setCopyMenuOpen(false);
            }}
            onFocusCapture={() => setCopyMenuOpen(true)}
            onBlurCapture={(event) => {
              if (resolveInteractiveContainment(event.relatedTarget)) return;
              setCopyMenuOpen(false);
            }}
          >
            <button
              ref={triggerRef}
              type="button"
              className={`secondaryBtn h-6 w-full justify-between rounded-md border-border/70 px-1.5 text-left text-[10px] ${
                copyMenuOpen ? "border-borderStrong bg-accentSoft" : ""
              }`}
              aria-haspopup="menu"
              aria-expanded={copyMenuOpen ? "true" : "false"}
              data-testid="bpmn-context-menu-action-copy-submenu-trigger"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCopyMenuOpen((current) => !current);
              }}
            >
              <span>Скопировать</span>
              <span aria-hidden="true" className="text-[11px] text-muted">
                {copyMenuPlacement === "left" ? "‹" : "›"}
              </span>
            </button>
          </div>
        ) : null}
      </div>
      {copyMenuOpen && copyMenuViewportStyle && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={submenuRef}
            role="menu"
            className="flex min-w-[168px] flex-col gap-0.5 rounded-lg border border-border/80 bg-panel px-1.5 py-1.5 shadow-2xl shadow-black/30"
            style={copyMenuViewportStyle}
            data-testid="bpmn-context-menu-copy-submenu"
            onMouseEnter={() => setCopyMenuOpen(true)}
            onMouseLeave={(event) => {
              if (resolveInteractiveContainment(event.relatedTarget)) return;
              setCopyMenuOpen(false);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {copyItems.map((item) => (
              <ActionButton
                key={`bpmn_ctx_copy_action_${toText(item.id)}`}
                item={item}
                onAction={async (actionId) => {
                  setCopyMenuOpen(false);
                  await onAction?.(actionId);
                }}
                extraClassName="bg-panel2/70"
              />
            ))}
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
