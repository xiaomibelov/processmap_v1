import React, { useCallback, useEffect, useRef } from "react";

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
  const editorRef = useRef(null);

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

  return (
    <div
      style={{
        position: "absolute",
        left: inlineEdit.left,
        top: inlineEdit.top - 36,
        width: Math.max(inlineEdit.width, 120),
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
