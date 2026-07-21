import {
  TOBE_DOC_DEFAULT_WIDTH,
  TOBE_DOC_DEFAULT_HEIGHT,
  TOBE_DOC_MIN_WIDTH,
  TOBE_DOC_MIN_HEIGHT,
} from "./tobeDocumentModel.js";

// To-Be document shape: intentionally minimal DOM (host + header + snippet,
// three nodes per document). The header icon is a CSS ::before, the close
// button a CSS ::after glyph and the resize grip a CSS background triangle —
// both are handled as pointer hit zones on the host, so no extra nodes are
// needed for them.

const TITLE_MAX_LENGTH = 80;
const SNIPPET_MAX_LENGTH = 160;
const SNIPPET_PLACEHOLDER = "Клик — предпросмотр · двойной клик — открыть";

// Hit zones in screen pixels (they scale with the zoomed card, same as the
// CSS-drawn glyphs they activate).
const CLOSE_ZONE_PX = 20;
const RESIZE_ZONE_PX = 18;
const DRAG_THRESHOLD_PX = 3;

function clampText(value, maxLength) {
  let text = String(value ?? "").trim();
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}...`;
  }
  return text;
}

function asDimension(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function buildCardContent(host, doc) {
  const title = clampText(doc?.title, TITLE_MAX_LENGTH);
  const headerEl = document.createElement("div");
  headerEl.classList.add("fpc-tobe-doc-header");
  headerEl.textContent = title;
  if (title) headerEl.title = title;
  host.appendChild(headerEl);

  const snippet = clampText(doc?.snippet, SNIPPET_MAX_LENGTH) || SNIPPET_PLACEHOLDER;
  const snippetEl = document.createElement("div");
  snippetEl.classList.add("fpc-tobe-doc-snippet");
  snippetEl.textContent = snippet;
  host.appendChild(snippetEl);
}

function resolveScale(getScale) {
  try {
    const scale = Number(getScale?.());
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  } catch {
    return 1;
  }
}

// Pointer interactions on the shape: drag (whole card), resize (bottom-right
// grip zone) and close (top-right × glyph zone). During a gesture only the
// DOM is touched (transform / width / height); the record is committed once
// on pointerup via onCommit — no per-mousemove state updates.
function attachShapeInteractions(host, metrics, interactions) {
  if (typeof host.addEventListener !== "function") return;
  const onCommit = typeof interactions?.onCommit === "function" ? interactions.onCommit : null;
  const getScale = interactions?.getScale;
  let gesture = null;
  let suppressClick = false;

  function readHitRect(event) {
    if (typeof host.getBoundingClientRect !== "function") return null;
    try {
      return host.getBoundingClientRect();
    } catch {
      return null;
    }
  }

  function restoreDom() {
    host.classList.remove("fpc-tobe-doc--gesture");
    host.style.setProperty("transform", "");
    host.style.setProperty("width", `${metrics.width}px`);
    host.style.setProperty("height", `${metrics.height}px`);
  }

  host.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== undefined) return;
    const rect = readHitRect(event);
    if (rect) {
      const inCloseZone = event.clientX >= rect.right - CLOSE_ZONE_PX
        && event.clientY <= rect.top + CLOSE_ZONE_PX;
      if (inCloseZone) {
        suppressClick = true;
        event.preventDefault();
        event.stopPropagation();
        onCommit?.({ visible: false });
        return;
      }
    }
    const inResizeZone = rect
      && event.clientX >= rect.right - RESIZE_ZONE_PX
      && event.clientY >= rect.bottom - RESIZE_ZONE_PX;
    gesture = {
      mode: inResizeZone ? "resize" : "drag",
      startClientX: Number(event.clientX) || 0,
      startClientY: Number(event.clientY) || 0,
      scale: resolveScale(getScale),
      moved: false,
    };
    try {
      host.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
    event.preventDefault();
  });

  host.addEventListener("pointermove", (event) => {
    if (!gesture) return;
    const deltaX = (Number(event.clientX) || 0) - gesture.startClientX;
    const deltaY = (Number(event.clientY) || 0) - gesture.startClientY;
    if (!gesture.moved) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD_PX && Math.abs(deltaY) < DRAG_THRESHOLD_PX) return;
      gesture.moved = true;
      host.classList.add("fpc-tobe-doc--gesture");
    }
    if (gesture.mode === "resize") {
      const width = Math.max(TOBE_DOC_MIN_WIDTH, metrics.width + deltaX / gesture.scale);
      const height = Math.max(TOBE_DOC_MIN_HEIGHT, metrics.height + deltaY / gesture.scale);
      host.style.setProperty("width", `${width}px`);
      host.style.setProperty("height", `${height}px`);
      return;
    }
    host.style.setProperty(
      "transform",
      `translate(${deltaX / gesture.scale}px, ${deltaY / gesture.scale}px)`,
    );
  });

  host.addEventListener("pointerup", (event) => {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    if (!current.moved) return; // plain click — the delegated popover handler owns it
    suppressClick = true;
    host.classList.remove("fpc-tobe-doc--gesture");
    const deltaX = ((Number(event.clientX) || 0) - current.startClientX) / current.scale;
    const deltaY = ((Number(event.clientY) || 0) - current.startClientY) / current.scale;
    if (current.mode === "resize") {
      const width = Math.max(TOBE_DOC_MIN_WIDTH, Math.round(metrics.width + deltaX));
      const height = Math.max(TOBE_DOC_MIN_HEIGHT, Math.round(metrics.height + deltaY));
      if (width !== metrics.width || height !== metrics.height) {
        // Keep the resized DOM in place until the remount lands.
        onCommit?.({ width, height });
        return;
      }
    } else {
      const x = Math.round(metrics.x + deltaX);
      const y = Math.round(metrics.y + deltaY);
      if (x !== metrics.x || y !== metrics.y) {
        // Keep the drag transform in place until the remount lands.
        onCommit?.({ x, y });
        return;
      }
    }
    restoreDom();
  });

  host.addEventListener("pointercancel", () => {
    if (!gesture) return;
    gesture = null;
    restoreDom();
  });

  // Swallow the click that follows a finished gesture / close hit so it does
  // not reach the delegated document click handler (which opens the popover).
  host.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  });
}

export function createTobeDocumentHost(doc, interactions = null) {
  if (typeof document === "undefined") return null;

  const host = document.createElement("div");
  host.classList.add("fpc-tobe-doc");
  host.dataset.fpcElementId = String(doc?.anchorElementId || "");
  host.dataset.fpcTobeDocId = String(doc?.id || "");
  const color = String(doc?.color || "").trim();
  if (color) {
    host.style.setProperty("--fpc-tobe-accent", color);
  }

  const width = asDimension(doc?.width, TOBE_DOC_DEFAULT_WIDTH);
  const height = asDimension(doc?.height, TOBE_DOC_DEFAULT_HEIGHT);
  host.style.setProperty("width", `${width}px`);
  host.style.setProperty("height", `${height}px`);

  buildCardContent(host, doc);

  const x = Number(doc?.x);
  const y = Number(doc?.y);
  const position = {
    top: Number.isFinite(y) ? y : 0,
    left: Number.isFinite(x) ? x : 0,
  };

  if (interactions) {
    attachShapeInteractions(host, { x: position.left, y: position.top, width, height }, interactions);
  }

  return { host, position };
}

// Ghost card shown while placing a new document: same visuals as the real
// shape, no datasets (never matches the delegated click selector) and no
// interactions — the ghost follows the mouse and is pointer-events: none.
export function createTobeGhostHost(doc) {
  if (typeof document === "undefined") return null;

  const host = document.createElement("div");
  host.classList.add("fpc-tobe-doc");
  host.classList.add("fpc-tobe-doc-ghost");
  host.style.setProperty("width", `${TOBE_DOC_DEFAULT_WIDTH}px`);
  host.style.setProperty("height", `${TOBE_DOC_DEFAULT_HEIGHT}px`);
  buildCardContent(host, doc);
  return { host };
}
