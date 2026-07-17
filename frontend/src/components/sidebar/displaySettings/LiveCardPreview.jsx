// LiveCardPreview (property-panel-redesign, Phase 2).
//
// Renders the overlay card exactly as the canvas would show it (same
// buildPropertiesOverlayPreview output, already filtered by hiddenFields),
// updating live from the draft — no save required. Root process selections
// never get a canvas card, so the caller hides this component for them.
//
// When onPropertyValueChange is provided, property values become
// click-to-edit: click → inline input → Enter/Blur → save.

import { useEffect, useRef, useState } from "react";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function EditableValue({ value, propertyName, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== value) {
      onCommit(propertyName, trimmed);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        className="liveCardPreviewValue liveCardPreviewValue--editable"
        onClick={() => setEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
        title="Нажмите для редактирования"
      >
        {value || <span className="text-muted">—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="liveCardPreviewValueInput"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    />
  );
}

export default function LiveCardPreview({ preview = null, elementName = "", onPropertyValueChange }) {
  const items = ensureArray(preview?.items);
  const hiddenCount = Math.max(0, Number(preview?.hiddenCount || 0));
  const displayName = String(preview?.displayName || "").trim();
  const editable = typeof onPropertyValueChange === "function";

  return (
    <div className="liveCardPreview" data-testid="live-card-preview">
      <div className="liveCardPreviewHeader">
        <span className="overlayDisplayLabel">Превью оверлея</span>
        {elementName && <span className="liveCardPreviewElement" title={elementName}>{elementName}</span>}
      </div>
      {items.length === 0 && !displayName ? (
        <div className="liveCardPreviewEmpty">У элемента нет свойств</div>
      ) : (
        <div className="liveCardPreviewCard" role="list" aria-label="Превью оверлея">
          {displayName && (
            <div className="liveCardPreviewTitle" title={displayName}>{displayName}</div>
          )}
          {items.map((item, index) => (
            <div className="liveCardPreviewRow" role="listitem" key={item.key || `${item.label}:${index}`}>
              <span className="liveCardPreviewLabel">{item.label}</span>
              {editable ? (
                <EditableValue
                  value={item.value}
                  propertyName={item.key ?? item.label}
                  onCommit={onPropertyValueChange}
                />
              ) : (
                <span className="liveCardPreviewValue">{item.value}</span>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div className="liveCardPreviewMore">+{hiddenCount}</div>
          )}
        </div>
      )}
    </div>
  );
}
