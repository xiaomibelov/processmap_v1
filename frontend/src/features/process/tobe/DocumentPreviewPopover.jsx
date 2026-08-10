import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import TobeDocumentActions from "./TobeDocumentActions.jsx";
import { resolveTobeDocumentUrls } from "./tobeDocumentUrls.js";

const POPOVER_WIDTH = 400;
const POPOVER_HEIGHT = 300;
const FALLBACK_TIMEOUT_MS = 3000;
const VIEWPORT_MARGIN = 8;

function toText(value) {
  return String(value || "").trim();
}

// Floating position near the clicked canvas card (clamped to the viewport,
// flipped above the card when there is no room below). Without an anchor
// (opened from the sidebar) the popover is centered.
function computePopoverStyle(anchorRect) {
  if (!anchorRect || typeof window === "undefined") {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: POPOVER_WIDTH,
      height: POPOVER_HEIGHT,
    };
  }
  let left = Number(anchorRect.left || 0);
  let top = Number(anchorRect.bottom || 0) + VIEWPORT_MARGIN;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN));
  if (top + POPOVER_HEIGHT > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, Number(anchorRect.top || 0) - POPOVER_HEIGHT - VIEWPORT_MARGIN);
  }
  return { left, top, width: POPOVER_WIDTH, height: POPOVER_HEIGHT };
}

// First-level To-Be document preview (400x300). The iframe exists only while
// the popover is open and is removed from the DOM on close. If the preview
// does not load within FALLBACK_TIMEOUT_MS a placeholder with an external
// link replaces it (private/unavailable docs). Non-Google URLs render as a
// plain link — no iframe.
export default function DocumentPreviewPopover({ doc, anchorRect, onExpand, onClose }) {
  const rootRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const docId = doc?.id || "";
  const { isGoogleDoc, openUrl, previewUrl } = resolveTobeDocumentUrls(doc);
  const title = toText(doc?.title) || "Без названия";

  // Reset the loading/fallback state per document; cancel the pending
  // fallback timer when the document changes or the popover closes.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    if (!previewUrl) return undefined;
    const timer = setTimeout(() => setFailed(true), FALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, previewUrl]);

  // Close on Escape and on mousedown outside the popover (covers canvas pan
  // start; canvas cards stop propagation earlier so card clicks replace the
  // document instead of closing). Wheel-zoom on the BPMN canvas also closes
  // the popover — the anchor position becomes stale as the canvas transforms.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) onClose?.();
    };
    const onWheel = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (event.target?.closest?.(".djs-container")) onClose?.();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!doc || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[90] flex flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-panel"
      style={computePopoverStyle(anchorRect)}
      data-fpc-doc-preview-popover="1"
      data-testid="tobe-doc-popover"
      role="dialog"
      aria-label={title}
    >
      <div className="flex items-center gap-2 border-b border-border bg-panel2 px-3 py-2">
        <span aria-hidden="true">📄</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>{title}</span>
        <button
          type="button"
          className="iconBtn"
          onClick={onClose}
          title="Закрыть"
          data-testid="tobe-doc-popover-close"
        >
          ✕
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-white">
        {previewUrl && !failed ? (
          <>
            {!loaded ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                data-testid="tobe-doc-popover-loading"
              >
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-fg" aria-hidden="true" />
              </div>
            ) : null}
            <iframe
              title={title}
              src={previewUrl}
              className="h-full w-full border-0"
              onLoad={() => setLoaded(true)}
              data-testid="tobe-doc-popover-iframe"
            />
          </>
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted"
            data-testid="tobe-doc-popover-unavailable"
          >
            {isGoogleDoc ? (
              <span>Документ недоступен для предпросмотра</span>
            ) : (
              <span className="break-all">{openUrl || "Превью недоступно"}</span>
            )}
            {openUrl ? (
              <a
                className="ghostBtn h-8 px-3 text-xs inline-flex items-center"
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="tobe-doc-popover-open-fallback"
              >
                {isGoogleDoc ? "Открыть в Google Docs" : "Открыть"}
              </a>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-panel2 px-3 py-2">
        <button
          type="button"
          className="primaryBtn h-8 px-3 text-xs"
          onClick={onExpand}
          data-testid="tobe-doc-popover-expand"
        >
          Расширить
        </button>
        <TobeDocumentActions doc={doc} size="sm" />
      </div>
    </div>,
    document.body,
  );
}
