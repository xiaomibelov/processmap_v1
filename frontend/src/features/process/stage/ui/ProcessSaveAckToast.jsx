import { useEffect, useMemo, useState } from "react";

const VIEWPORT_GAP_PX = 12;
const TOOLBAR_GAP_PX = 12;
const TOAST_MAX_WIDTH_PX = 420;
const TOAST_MIN_WIDTH_PX = 220;
const TOAST_ESTIMATED_HEIGHT_PX = 52;
const HEADER_TOAST_PREFERRED_WIDTH_PX = 360;
const HEADER_TOAST_VERTICAL_OFFSET_PX = 8;
const TOAST_EXIT_ANIMATION_MS = 280;

function resolveToneClass(tone) {
  if (tone === "error") {
    return "border-rose-300/90 bg-rose-100/95 text-rose-900 shadow-[0_10px_28px_hsl(346_68%_32%_/_0.24)]";
  }
  if (tone === "warning") {
    return "border-amber-300/90 bg-amber-100/95 text-amber-900 shadow-[0_10px_28px_hsl(36_88%_32%_/_0.20)]";
  }
  if (tone === "info") {
    return "border-sky-300/90 bg-sky-100/95 text-sky-900 shadow-[0_10px_26px_hsl(205_88%_34%_/_0.18)]";
  }
  return "border-emerald-300/90 bg-emerald-100/95 text-emerald-900 shadow-[0_10px_28px_hsl(154_55%_30%_/_0.20)]";
}

export default function ProcessSaveAckToast({
  visible = false,
  message = "",
  tone = "success",
  description = "",
  actionLabel = "",
  onAction,
  actionDisabled = false,
  persistent = false,
  onDismiss,
} = {}) {
  const normalizedMessage = String(message || "").trim();
  const normalizedDescription = String(description || "").trim();
  const normalizedActionLabel = String(actionLabel || "").trim();
  const shouldRender = visible === true && normalizedMessage.length > 0;
  const canDismiss = typeof onDismiss === "function";
  const canAct = normalizedActionLabel.length > 0 && typeof onAction === "function";
  const [isMounted, setIsMounted] = useState(shouldRender);
  const [isShown, setIsShown] = useState(shouldRender);

  const [toolbarRect, setToolbarRect] = useState(null);

  useEffect(() => {
    let exitTimerId = 0;
    let rafId = 0;
    const hasWindow = typeof window !== "undefined";

    if (shouldRender) {
      setIsMounted(true);
      if (!hasWindow) {
        setIsShown(true);
      } else {
        rafId = window.requestAnimationFrame(() => {
          setIsShown(true);
        });
      }
    } else if (isMounted) {
      setIsShown(false);
      if (!hasWindow) {
        setIsMounted(false);
      } else {
        exitTimerId = window.setTimeout(() => {
          setIsMounted(false);
        }, TOAST_EXIT_ANIMATION_MS);
      }
    }

    return () => {
      if (hasWindow && rafId) window.cancelAnimationFrame(rafId);
      if (hasWindow && exitTimerId) window.clearTimeout(exitTimerId);
    };
  }, [isMounted, shouldRender]);

  useEffect(() => {
    if (isMounted !== true) {
      setToolbarRect(null);
      return undefined;
    }
    if (typeof document === "undefined" || typeof window === "undefined") return undefined;

    const updateToolbarRect = () => {
      const headerAnchorNode = document.querySelector('[data-testid="diagram-toolbar-notification-anchor"]');
      if (headerAnchorNode && typeof headerAnchorNode.getBoundingClientRect === "function") {
        const rect = headerAnchorNode.getBoundingClientRect();
        if (
          Number.isFinite(rect.left)
          && Number.isFinite(rect.top)
          && rect.width > 0
          && rect.height > 0
        ) {
          setToolbarRect({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            kind: "header-anchor",
          });
          return;
        }
      }

      const headerSlotNode = document.querySelector(".diagramToolbarSlot--right");
      if (headerSlotNode && typeof headerSlotNode.getBoundingClientRect === "function") {
        const rect = headerSlotNode.getBoundingClientRect();
        if (
          Number.isFinite(rect.left)
          && Number.isFinite(rect.top)
          && rect.width > 0
          && rect.height > 0
        ) {
          setToolbarRect({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            kind: "header-slot",
          });
          return;
        }
      }

      const diagramToolbarNode = document.querySelector(".diagramActionBar");
      if (!diagramToolbarNode || typeof diagramToolbarNode.getBoundingClientRect !== "function") {
        setToolbarRect(null);
        return;
      }
      const rect = diagramToolbarNode.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
        setToolbarRect(null);
        return;
      }
      setToolbarRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        kind: "diagram-toolbar",
      });
    };

    updateToolbarRect();
    window.addEventListener("resize", updateToolbarRect);
    window.addEventListener("scroll", updateToolbarRect, true);
    return () => {
      window.removeEventListener("resize", updateToolbarRect);
      window.removeEventListener("scroll", updateToolbarRect, true);
    };
  }, [isMounted]);

  const containerStyle = useMemo(() => {
    if (!toolbarRect || typeof window === "undefined") return null;

    const viewportWidth = Number(window.innerWidth || 0);
    const viewportHeight = Number(window.innerHeight || 0);
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;

    const maxWidthByViewport = Math.max(
      TOAST_MIN_WIDTH_PX,
      Math.min(TOAST_MAX_WIDTH_PX, viewportWidth - VIEWPORT_GAP_PX * 2),
    );

    if (toolbarRect.kind === "header-anchor" || toolbarRect.kind === "header-slot") {
      const headerTopFloor = VIEWPORT_GAP_PX + HEADER_TOAST_VERTICAL_OFFSET_PX;
      const availableLeft = Math.max(
        TOAST_MIN_WIDTH_PX,
        toolbarRect.right - VIEWPORT_GAP_PX,
      );
      const width = Math.max(
        TOAST_MIN_WIDTH_PX,
        Math.min(maxWidthByViewport, HEADER_TOAST_PREFERRED_WIDTH_PX, availableLeft),
      );
      const left = Math.max(
        VIEWPORT_GAP_PX,
        Math.min(
          toolbarRect.right - width,
          viewportWidth - VIEWPORT_GAP_PX - width,
        ),
      );
      const top = Math.min(
        viewportHeight - TOAST_ESTIMATED_HEIGHT_PX - VIEWPORT_GAP_PX,
        Math.max(
          headerTopFloor,
          toolbarRect.top
            + (toolbarRect.height - TOAST_ESTIMATED_HEIGHT_PX) / 2
            + HEADER_TOAST_VERTICAL_OFFSET_PX,
        ),
      );
      return {
        position: "fixed",
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        width: `${Math.round(width)}px`,
      };
    }

    const availableLeft = toolbarRect.left - VIEWPORT_GAP_PX - TOOLBAR_GAP_PX;
    const hasRoomOnLeft = availableLeft >= TOAST_MIN_WIDTH_PX;

    if (hasRoomOnLeft) {
      const width = Math.min(maxWidthByViewport, availableLeft);
      const left = Math.max(
        VIEWPORT_GAP_PX,
        toolbarRect.left - TOOLBAR_GAP_PX - width,
      );
      const top = Math.min(
        viewportHeight - TOAST_ESTIMATED_HEIGHT_PX - VIEWPORT_GAP_PX,
        Math.max(
          VIEWPORT_GAP_PX,
          toolbarRect.top + (toolbarRect.height - TOAST_ESTIMATED_HEIGHT_PX) / 2,
        ),
      );
      return {
        position: "fixed",
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        width: `${Math.round(width)}px`,
      };
    }

    // Fallback для узкого viewport: уводим toast ниже toolbar без перекрытия.
    const width = maxWidthByViewport;
    const left = Math.max(
      VIEWPORT_GAP_PX,
      Math.min(
        toolbarRect.right - width,
        viewportWidth - VIEWPORT_GAP_PX - width,
      ),
    );
    const top = Math.min(
      viewportHeight - TOAST_ESTIMATED_HEIGHT_PX - VIEWPORT_GAP_PX,
      toolbarRect.bottom + TOOLBAR_GAP_PX,
    );
    return {
      position: "fixed",
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
    };
  }, [toolbarRect]);

  if (!isMounted) return null;

  const containerClassName = containerStyle
    ? "pointer-events-none fixed z-[130] w-[min(92vw,420px)]"
    : "pointer-events-none fixed bottom-5 left-1/2 z-[130] w-[min(92vw,420px)] -translate-x-1/2 sm:bottom-6";
  const toneClass = resolveToneClass(String(tone || "").trim());
  return (
    <div
      className={containerClassName}
      style={containerStyle || undefined}
    >
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto rounded-xl border px-3.5 py-2 text-[13px] font-medium leading-5 shadow-2xl backdrop-blur transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isShown ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"} ${toneClass}`}
        data-testid="process-save-ack-toast"
        data-persistent={persistent === true ? "true" : undefined}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div>{normalizedMessage}</div>
            {normalizedDescription ? (
              <div className="mt-0.5 text-[12px] font-normal opacity-80" data-testid="process-save-ack-toast-description">
                {normalizedDescription}
              </div>
            ) : null}
          </div>
          {canDismiss ? (
            <button
              type="button"
              className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded-md text-base leading-none opacity-70 transition hover:bg-black/10 hover:opacity-100 disabled:opacity-40"
              onClick={onDismiss}
              aria-label="Закрыть уведомление"
              data-testid="process-save-ack-toast-dismiss"
            >
              ×
            </button>
          ) : null}
        </div>
        {canAct ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="rounded-md border border-current/25 bg-white/35 px-2.5 py-1 text-[12px] font-semibold leading-4 transition hover:bg-white/55 disabled:cursor-not-allowed disabled:opacity-55"
              onClick={onAction}
              disabled={actionDisabled === true}
              data-testid="process-save-ack-toast-action"
            >
              {normalizedActionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
