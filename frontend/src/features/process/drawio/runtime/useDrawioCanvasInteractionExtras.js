import { useCallback, useEffect, useRef, useState } from "react";
import { readDrawioTextElementContent } from "../drawioSvg.js";

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const HANDLE_CURSORS = {
  nw: "nwse-resize",
  ne: "nesw-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

export function getResizeHandleCursor(handleId) {
  return HANDLE_CURSORS[String(handleId || "")] || "default";
}

/**
 * Returns resize handle specs for a bbox { x, y, width, height }.
 * Coordinates are in diagram (viewport-group) space.
 */
export function buildResizeHandleSpecs(bbox) {
  if (!bbox) return [];
  const { x, y, width, height } = bbox;
  return [
    { id: "nw", cx: x, cy: y },
    { id: "n", cx: x + width / 2, cy: y },
    { id: "ne", cx: x + width, cy: y },
    { id: "e", cx: x + width, cy: y + height / 2 },
    { id: "se", cx: x + width, cy: y + height },
    { id: "s", cx: x + width / 2, cy: y + height },
    { id: "sw", cx: x, cy: y + height },
    { id: "w", cx: x, cy: y + height / 2 },
  ];
}

/**
 * Computes new dimensions from handle + delta.
 */
function applyResizeHandleDelta({ handle, startW, startH, dx, dy }) {
  let w = startW;
  let h = startH;
  if (handle.includes("e")) w = Math.max(24, startW + dx);
  if (handle.includes("s")) h = Math.max(24, startH + dy);
  if (handle.includes("w")) w = Math.max(24, startW - dx);
  if (handle.includes("n")) h = Math.max(24, startH - dy);
  return { width: Math.round(w), height: Math.round(h) };
}

/**
 * Hook: manages resize-drag and double-click inline text edit for draw.io overlay.
 *
 * Returns:
 *  - selectedBbox: { x, y, width, height, hasResize, hasText } in diagram coords, or null
 *  - resizeDraft: { width, height } preview while dragging, or null
 *  - startResizeDrag(event, handleId): call on pointerdown of a resize handle
 *  - inlineEdit: { elementId, text, left, top, width, height } in container px, or null
 *  - commitInlineText(text): apply and close inline editor
 *  - cancelInlineEdit(): close without applying
 */
export default function useDrawioCanvasInteractionExtras({
  rootRef,
  viewportGroupRef,
  containerRef,
  selectedId,
  elementMap,
  meta,
  renderedBody,
  svgCache,
  screenToDiagram,
  onCommitResize,
  onCommitTextResize,
  onCommitText,
  visible,
}) {
  const [selectedBbox, setSelectedBbox] = useState(null);
  const [resizeDraft, setResizeDraft] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(null);

  const resizeDragRef = useRef(null);
  const resizeCleanupRef = useRef(null);

  // ── Compute selected element bbox in diagram space ────────────────────────
  useEffect(() => {
    if (!selectedId || !visible) {
      setSelectedBbox(null);
      return undefined;
    }
    const rafId = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!(root instanceof Element) || typeof screenToDiagram !== "function") {
        setSelectedBbox(null);
        return;
      }
      const node = root.querySelector(`[data-drawio-el-id="${CSS.escape(selectedId)}"]`);
      if (!(node instanceof Element)) {
        setSelectedBbox(null);
        return;
      }
      try {
        const rect = node.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1) {
          setSelectedBbox(null);
          return;
        }
        const tl = screenToDiagram(rect.left, rect.top);
        const br = screenToDiagram(rect.right, rect.bottom);
        if (!tl || !br) {
          setSelectedBbox(null);
          return;
        }
        // Detect capabilities from DOM structure
        const tagName = (node.tagName || "").toLowerCase();
        const childTag = (node.firstElementChild?.tagName || "").toLowerCase();
        const effectiveTag = tagName === "g" ? childTag : tagName;
        const isTextSelf = tagName === "text" || tagName === "foreignobject";
        const hasResize = effectiveTag === "rect" || isTextSelf;
        const hasText = isTextSelf || !!node.querySelector("text, foreignObject");
        setSelectedBbox({
          x: tl.x,
          y: tl.y,
          width: Math.abs(br.x - tl.x),
          height: Math.abs(br.y - tl.y),
          hasResize,
          hasText,
          isText: isTextSelf,
        });
      } catch {
        setSelectedBbox(null);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedId, renderedBody, visible, rootRef, screenToDiagram]);

  // Clear bbox when selection is cleared
  useEffect(() => {
    if (!selectedId) setSelectedBbox(null);
  }, [selectedId]);

  // ── Resize drag ───────────────────────────────────────────────────────────
  const startResizeDrag = useCallback((event, handleId) => {
    if (!selectedId || !selectedBbox || typeof screenToDiagram !== "function") return;
    event.preventDefault();
    event.stopPropagation();

    const startPt = screenToDiagram(
      Number(event.clientX || 0),
      Number(event.clientY || 0),
    );
    if (!startPt) return;

    resizeDragRef.current = {
      handle: String(handleId || ""),
      elementId: selectedId,
      startX: startPt.x,
      startY: startPt.y,
      startW: selectedBbox.width,
      startH: selectedBbox.height,
      isText: !!selectedBbox.isText,
    };

    const onMove = (e) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const pt = screenToDiagram(Number(e.clientX || 0), Number(e.clientY || 0));
      if (!pt) return;
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const next = applyResizeHandleDelta({
        handle: drag.handle,
        startW: drag.startW,
        startH: drag.startH,
        dx,
        dy,
      });
      setResizeDraft(next);
    };

    const finish = (e) => {
      const drag = resizeDragRef.current;
      resizeDragRef.current = null;
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      setResizeDraft(null);
      if (!drag) return;
      const pt = screenToDiagram(Number(e.clientX || 0), Number(e.clientY || 0));
      const dx = pt ? pt.x - drag.startX : 0;
      const dy = pt ? pt.y - drag.startY : 0;
      const next = applyResizeHandleDelta({
        handle: drag.handle,
        startW: drag.startW,
        startH: drag.startH,
        dx,
        dy,
      });
      if (next.width !== drag.startW || next.height !== drag.startH) {
        if (drag.isText) {
          onCommitTextResize?.(drag.elementId, next.width, "canvas_drag_resize");
        } else {
          onCommitResize?.(drag.elementId, {
            width: String(next.width),
            height: String(next.height),
          }, "canvas_drag_resize");
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [selectedId, selectedBbox, screenToDiagram, onCommitResize, onCommitTextResize]);

  // ── Double-click inline text edit ─────────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof Element)) return undefined;

    const onDblClick = (event) => {
      if (!visible) return;
      const mode = String(meta?.interaction_mode || meta?.drawioMode || "").toLowerCase();
      if (mode && mode !== "edit") return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      // Walk up to find data-drawio-el-id
      let node = target;
      let hitId = null;
      while (node instanceof Element && root.contains(node)) {
        const id = node.getAttribute("data-drawio-el-id");
        if (id) { hitId = id; break; }
        if (node === root) break;
        node = node.parentElement;
      }
      if (!hitId) return;

      const elementState = elementMap.get(hitId);
      if (!elementState || elementState.deleted || elementState.locked) return;

      // Find element node
      const svgNode = root.querySelector(`[data-drawio-el-id="${CSS.escape(hitId)}"]`);
      if (!(svgNode instanceof Element)) return;

      // Check if the node itself is a text/foreignObject, or has one inside
      const selfTag = (svgNode.tagName || "").toLowerCase();
      const textEl = (selfTag === "text" || selfTag === "foreignobject")
        ? svgNode
        : svgNode.querySelector("text, foreignObject");
      if (!textEl) return;

      // Use svg_cache to read the canonical text (avoids XML entity decoding issues from DOM)
      const currentText = readDrawioTextElementContent(svgCache, hitId) ?? (textEl.textContent || "").trim();

      // Position relative to container
      const container = containerRef.current;
      if (!(container instanceof Element)) return;
      const containerRect = container.getBoundingClientRect();
      const svgRect = svgNode.getBoundingClientRect();
      const left = Math.round(svgRect.left - containerRect.left);
      const top = Math.round(svgRect.top - containerRect.top);
      const width = Math.max(80, Math.round(svgRect.width));
      const height = Math.max(28, Math.round(svgRect.height));

      setInlineEdit({ elementId: hitId, text: currentText, left, top, width, height });
      event.preventDefault();
    };

    root.addEventListener("dblclick", onDblClick);
    return () => root.removeEventListener("dblclick", onDblClick);
  }, [rootRef, containerRef, elementMap, meta, visible]);

  const commitInlineText = useCallback((text) => {
    const edit = inlineEdit;
    setInlineEdit(null);
    if (!edit) return;
    onCommitText?.(edit.elementId, String(text ?? ""), "canvas_dblclick_text_edit");
  }, [inlineEdit, onCommitText]);

  const cancelInlineEdit = useCallback(() => {
    setInlineEdit(null);
  }, []);

  // Cleanup resize drag on unmount
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  return {
    selectedBbox,
    resizeDraft,
    startResizeDrag,
    inlineEdit,
    commitInlineText,
    cancelInlineEdit,
  };
}
