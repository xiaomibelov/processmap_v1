# Performance Notes

## Tab Switch Performance
- Analysis ↔ Diagram tab switch is **visually instantaneous**.
- No loader/spinner observed.
- No toast/notification on tab switch.
- DOM node count change: ±0–26 nodes (negligible, within measurement noise).
- **Conclusion**: Tab switch itself is not a performance bottleneck.

## Overlay Toggle Performance
- Enabling overlays (via localStorage + reload) increased DOM from 8,025 → 10,795 nodes.
- Each `.fpcPropertyOverlay` contains:
  - 1 container div with 8+ inline style properties
  - 1 table div
  - Per-row: 2 divs (row + cells) + 2 spans (key text + separator)
- For 180 overlays visible, this is ~1,000+ additional DOM elements.
- **Subjective smoothness**: Slight jank on first render with overlays ON. Pan/zoom feels acceptable on this small diagram.

## Pan/Zoom Performance
- Zoom in/out (1.0 → 1.6): No DOM growth, overlays reposition via bpmn-js `overlays.add` with `scale: false`.
- Pan canvas: No DOM growth.
- `applyPropertiesOverlayDecorForZoomChange` checks `zoomBucket` before re-applying; this works correctly.

## Large Diagram Projection
- Current session: ~15–20 BPMN elements, 180 property overlays when always-ON.
- If a session has 100+ elements with properties, overlay count could reach 500–1,000+ nodes.
- `applyPropertiesOverlayDecor` iterates `registry.getAll()` on every trigger — O(n) where n = element count.
