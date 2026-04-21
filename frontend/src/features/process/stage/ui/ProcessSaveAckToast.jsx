import { useEffect, useMemo, useState } from "react";

const VIEWPORT_GAP_PX = 12;
const TOOLBAR_GAP_PX = 12;
const TOAST_MAX_WIDTH_PX = 560;
const TOAST_MIN_WIDTH_PX = 240;
const TOAST_ESTIMATED_HEIGHT_PX = 56;

function resolveToneClass(tone) {
  if (tone === "error") {
    return "border-rose-500/55 bg-rose-500/18 text-rose-50";
  }
  if (tone === "warning") {
    return "border-amber-500/55 bg-amber-500/18 text-amber-50";
  }
  if (tone === "info") {
    return "border-sky-500/55 bg-sky-500/18 text-sky-50";
  }
  return "border-cyan-500/55 bg-cyan-500/18 text-cyan-50";
}

export default function ProcessSaveAckToast({
  visible = false,
  message = "",
  tone = "success",
} = {}) {
  const normalizedMessage = String(message || "").trim();
  const shouldRender = visible === true && normalizedMessage.length > 0;

  const [toolbarRect, setToolbarRect] = useState(null);

  useEffect(() => {
    if (visible !== true) {
      setToolbarRect(null);
      return undefined;
    }
    if (typeof document === "undefined" || typeof window === "undefined") return undefined;

    const updateToolbarRect = () => {
      const toolbarNode = document.querySelector(".diagramActionBar");
      if (!toolbarNode || typeof toolbarNode.getBoundingClientRect !== "function") {
        setToolbarRect(null);
        return;
      }
      const rect = toolbarNode.getBoundingClientRect();
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
      });
    };

    updateToolbarRect();
    window.addEventListener("resize", updateToolbarRect);
    window.addEventListener("scroll", updateToolbarRect, true);
    return () => {
      window.removeEventListener("resize", updateToolbarRect);
      window.removeEventListener("scroll", updateToolbarRect, true);
    };
  }, [visible]);

  const containerStyle = useMemo(() => {
    if (!toolbarRect || typeof window === "undefined") return null;

    const viewportWidth = Number(window.innerWidth || 0);
    const viewportHeight = Number(window.innerHeight || 0);
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;

    const maxWidthByViewport = Math.max(
      TOAST_MIN_WIDTH_PX,
      Math.min(TOAST_MAX_WIDTH_PX, viewportWidth - VIEWPORT_GAP_PX * 2),
    );
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

  if (!shouldRender) return null;

  const containerClassName = containerStyle
    ? "pointer-events-none fixed z-[130] w-[min(92vw,560px)]"
    : "pointer-events-none fixed bottom-5 left-1/2 z-[130] w-[min(92vw,560px)] -translate-x-1/2 sm:bottom-6";
  const toneClass = resolveToneClass(String(tone || "").trim());
  return (
    <div
      className={containerClassName}
      style={containerStyle || undefined}
    >
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur ${toneClass}`}
        data-testid="process-save-ack-toast"
      >
        {normalizedMessage}
      </div>
    </div>
  );
}
