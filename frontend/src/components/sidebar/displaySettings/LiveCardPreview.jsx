// LiveCardPreview (property-panel-redesign, Phase 2).
//
// Renders the overlay card exactly as the canvas would show it (same
// buildPropertiesOverlayPreview output, already filtered by hiddenFields),
// updating live from the draft — no save required. Root process selections
// never get a canvas card, so the caller hides this component for them.

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function LiveCardPreview({ preview = null, elementName = "" }) {
  const items = ensureArray(preview?.items);
  const hiddenCount = Math.max(0, Number(preview?.hiddenCount || 0));

  return (
    <div className="liveCardPreview" data-testid="live-card-preview">
      <div className="liveCardPreviewHeader">
        <span className="overlayDisplayLabel">Превью оверлея</span>
        {elementName && <span className="liveCardPreviewElement" title={elementName}>{elementName}</span>}
      </div>
      {items.length === 0 ? (
        <div className="liveCardPreviewEmpty">У элемента нет свойств</div>
      ) : (
        <div className="liveCardPreviewCard" role="list" aria-label="Превью оверлея">
          {items.map((item, index) => (
            <div className="liveCardPreviewRow" role="listitem" key={item.key || `${item.label}:${index}`}>
              <span className="liveCardPreviewLabel">{item.label}</span>
              <span className="liveCardPreviewValue">{item.value}</span>
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
