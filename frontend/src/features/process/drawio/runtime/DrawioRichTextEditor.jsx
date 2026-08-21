import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const INLINE_EDITOR_TOP_OFFSET = 36;
const INLINE_EDITOR_MIN_WIDTH = 120;
const INLINE_EDITOR_FALLBACK_HEIGHT = 72;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function computeInlineEditorLayout({
  inlineLeft,
  inlineTop,
  inlineWidth,
  containerWidth,
  containerHeight,
  editorHeight,
}) {
  const width = Math.max(INLINE_EDITOR_MIN_WIDTH, Math.round(toFiniteNumber(inlineWidth, 0)));
  const baseLeft = Math.round(toFiniteNumber(inlineLeft, 0));
  const baseTop = Math.round(toFiniteNumber(inlineTop, 0) - INLINE_EDITOR_TOP_OFFSET);
  const validContainer = Number.isFinite(containerWidth)
    && Number.isFinite(containerHeight)
    && containerWidth > 0
    && containerHeight > 0;
  if (!validContainer) {
    return { left: baseLeft, top: baseTop, width };
  }
  const safeHeight = Math.max(1, Math.round(toFiniteNumber(editorHeight, INLINE_EDITOR_FALLBACK_HEIGHT)));
  const maxLeft = Math.max(0, Math.round(containerWidth) - width);
  const maxTop = Math.max(0, Math.round(containerHeight) - safeHeight);
  return {
    left: clamp(baseLeft, 0, maxLeft),
    top: clamp(baseTop, 0, maxTop),
    width,
  };
}

/**
 * Converts storage format (plain text + **bold** markers + \n) to contenteditable HTML.
 */
function storageToHtml(text) {
  const lines = String(text ?? "").split("\n");
  return lines.map((line) => {
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // **bold** → <b>bold</b>
    return escaped.replace(/\*\*([^*]*)\*\*/g, "<b>$1</b>");
  }).join("<br>");
}

/**
 * Converts contenteditable innerHTML back to storage format.
 */
function htmlToStorage(html) {
  return String(html ?? "")
    .replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<div>([\s\S]*?)<\/div>/gi, "\n$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ");
}

/**
 * Rich text inline editor for draw.io elements.
 * Supports: multiline (Enter), bold (Ctrl+B / toolbar button).
 * Commit: Ctrl+Enter or click outside. Cancel: Escape.
 */
export default function DrawioRichTextEditor({ inlineEdit, onCommit, onCancel }) {
  const wrapperRef = useRef(null);
  const editorRef = useRef(null);
  const measureEditorHeightRef = useRef(() => {});
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [editorHeight, setEditorHeight] = useState(INLINE_EDITOR_FALLBACK_HEIGHT);
  const hasResizeObserver = typeof ResizeObserver === "function";

  const measureEditorHeight = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!(wrapper instanceof Element)) return;
    const rect = wrapper.getBoundingClientRect();
    if (!Number.isFinite(rect?.height) || rect.height < 1) return;
    const next = Math.round(rect.height);
    setEditorHeight((prev) => (prev === next ? prev : next));
  }, []);
  measureEditorHeightRef.current = measureEditorHeight;

  // Set initial HTML content
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = storageToHtml(inlineEdit.text);
    // Move cursor to end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.focus();
    let rafId = 0;
    if (typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(() => measureEditorHeightRef.current());
    } else {
      measureEditorHeightRef.current();
    }
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [inlineEdit.text]);

  const commit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    onCommit(htmlToStorage(el.innerHTML));
  }, [onCommit]);

  const handleKeyDown = useCallback((ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      onCancel();
      return;
    }
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      commit();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "b") {
      ev.preventDefault();
      document.execCommand("bold");
    }
  }, [commit, onCancel]);

  const toggleBold = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("bold");
  }, []);

  useLayoutEffect(() => {
    const host = wrapperRef.current?.parentElement;
    if (!(host instanceof Element)) return undefined;
    const updateHostSize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));
      setHostSize((prev) => (
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      ));
    };
    updateHostSize();
    const onResize = () => updateHostSize();
    window.addEventListener("resize", onResize);
    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(updateHostSize);
      resizeObserver.observe(host);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect?.();
    };
  }, []);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const editor = editorRef.current;
    if (!(wrapper instanceof Element)) return undefined;
    measureEditorHeight();
    let resizeObserver = null;
    if (hasResizeObserver) {
      resizeObserver = new ResizeObserver(() => measureEditorHeight());
      resizeObserver.observe(wrapper);
      if (editor instanceof Element) resizeObserver.observe(editor);
    }
    const onInput = () => measureEditorHeight();
    editor?.addEventListener("input", onInput);
    return () => {
      editor?.removeEventListener("input", onInput);
      resizeObserver?.disconnect?.();
    };
  }, [hasResizeObserver, measureEditorHeight]);

  useLayoutEffect(() => {
    if (hasResizeObserver) return undefined;
    measureEditorHeight();
    return undefined;
  }, [
    hasResizeObserver,
    hostSize.height,
    hostSize.width,
    inlineEdit.height,
    inlineEdit.id,
    inlineEdit.left,
    inlineEdit.top,
    inlineEdit.width,
    measureEditorHeight,
  ]);

  const layout = useMemo(() => computeInlineEditorLayout({
    inlineLeft: inlineEdit.left,
    inlineTop: inlineEdit.top,
    inlineWidth: inlineEdit.width,
    containerWidth: hostSize.width,
    containerHeight: hostSize.height,
    editorHeight,
  }), [
    editorHeight,
    hostSize.height,
    hostSize.width,
    inlineEdit.left,
    inlineEdit.top,
    inlineEdit.width,
  ]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        left: layout.left,
        top: layout.top,
        width: layout.width,
        zIndex: 20,
        pointerEvents: "all",
      }}
      data-testid="drawio-rich-text-editor"
      onMouseDown={(ev) => ev.stopPropagation()}
    >
      {/* Toolbar */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 3,
        background: "#1e293b",
        borderRadius: "4px 4px 0 0",
        padding: "3px 5px",
        alignItems: "center",
        userSelect: "none",
      }}>
        <button
          type="button"
          title="Жирный (Ctrl+B)"
          onMouseDown={(ev) => { ev.preventDefault(); toggleBold(); }}
          style={{
            fontWeight: "bold",
            fontSize: 13,
            color: "#f1f5f9",
            background: "transparent",
            border: "1px solid #475569",
            borderRadius: 3,
            padding: "1px 7px",
            cursor: "pointer",
            lineHeight: "1.4",
          }}
        >
          B
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#64748b" }}>Ctrl+Enter — сохранить</span>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onBlur={commit}
        style={{
          minHeight: 28,
          width: "100%",
          fontSize: 13,
          padding: "4px 6px",
          border: "2px solid #3b82f6",
          borderTop: "none",
          borderRadius: "0 0 3px 3px",
          background: "rgba(255,255,255,0.97)",
          outline: "none",
          boxSizing: "border-box",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: "1.5",
          textAlign: "center",
        }}
        data-testid="drawio-rich-text-editor-content"
      />
    </div>
  );
}
