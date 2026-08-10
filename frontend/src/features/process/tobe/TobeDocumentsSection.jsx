import { useState } from "react";

import { normalizeTobeDocument } from "./tobeDocumentModel.js";

// Phase 1 minimal add form: URL + title. Submit starts ghost placement on
// the canvas (when onGhostStart is wired): the inputs stay filled so an
// Escape cancel loses nothing, and the button is disabled while the ghost is
// active (single ghost at a time). Without onGhostStart it falls back to the
// legacy immediate add (anchor = currently selected element).
export default function TobeDocumentsSection({
  documents = [],
  onDocumentsChange,
  onDocumentClick,
  selectedElementId = "",
  disabled = false,
  ghostActive = false,
  onGhostStart = null,
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const docs = Array.isArray(documents) ? documents : [];
  const anchorId = String(selectedElementId || "").trim();
  const canSubmit = url.trim().length > 0 && !disabled && !ghostActive;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    const cleanUrl = url.trim();
    const cleanTitle = title.trim() || cleanUrl;
    if (typeof onGhostStart === "function") {
      onGhostStart({ url: cleanUrl, title: cleanTitle });
      return;
    }
    const doc = normalizeTobeDocument({
      url: cleanUrl,
      title: cleanTitle,
      anchorElementId: anchorId || null,
    });
    setUrl("");
    setTitle("");
    void onDocumentsChange?.([...docs, doc]);
  }

  return (
    <div className="displaySettingsRow" data-testid="tobe-docs-section">
      <span className="displaySettingsLabel">Документы на диаграмме</span>
      {docs.length > 0 ? (
        <ul className="grid gap-1" data-testid="tobe-docs-list">
          {docs.map((doc) => (
            <li key={doc.id} className="truncate text-xs" title={doc.url || ""}>
              <button
                type="button"
                className="w-full truncate text-left hover:underline"
                onClick={() => onDocumentClick?.(doc)}
                data-testid={`tobe-doc-open-${doc.id}`}
              >
                {doc.title || doc.url}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="grid gap-1" onSubmit={handleSubmit}>
        <input
          className="input sidebarInput h-8 min-h-0 w-full min-w-0"
          placeholder="Ссылка на Google Doc"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={disabled}
          data-testid="tobe-doc-url"
        />
        <input
          className="input sidebarInput h-8 min-h-0 w-full min-w-0"
          placeholder="Название"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={disabled}
          data-testid="tobe-doc-title"
        />
        <button
          type="submit"
          className="ghostBtn h-8 px-3 text-xs"
          disabled={!canSubmit}
          data-testid="tobe-doc-add"
        >
          {ghostActive ? "Кликните на диаграмму · Esc — отмена" : (anchorId ? "+ Документ к выделенному" : "+ Документ")}
        </button>
      </form>
    </div>
  );
}
