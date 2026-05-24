# DOM Overlay Counts Evidence

## Measurement Method
```javascript
{
  totalNodes: document.querySelectorAll('*').length,
  djsOverlay: document.querySelectorAll('.djs-overlay').length,
  djsOverlayContainer: document.querySelectorAll('.djs-overlay-container').length,
  fpcPropertyOverlay: document.querySelectorAll('.fpcPropertyOverlay').length,
  djsContainer: document.querySelectorAll('.djs-container').length,
  bpmnCanvas: document.querySelectorAll('.bpmnCanvas').length,
}
```

## Measurements

| State | totalNodes | djsOverlay | djsOverlayContainer | fpcPropertyOverlay | djsContainer | bpmnCanvas |
|-------|------------|------------|---------------------|-------------------|--------------|------------|
| Diagram, overlays OFF | 8,025 | 17 | 1 | 0 | 1 | 2 |
| Analysis tab (same session) | 7,999 | 17 | 1 | 0 | 1 | 2 |
| Diagram tab return | 8,025 | 17 | 1 | 0 | 1 | 2 |
| **Diagram, overlays ON** | **10,795** | **197** | **1** | **180** | **1** | **2** |
| Overlays ON → Analysis | 10,795 | 197 | 1 | 180 | 1 | 2 |
| Overlays ON → Diagram | 10,795 | 197 | 1 | 180 | 1 | 2 |
| Zoom in 3× (overlays ON) | 10,798 | 197 | 1 | 180 | 1 | 2 |
| Pan canvas (overlays ON) | 10,798 | 197 | 1 | 180 | 1 | 2 |

## Key Findings

1. **No duplication on tab switch**: `.fpcPropertyOverlay` count stays exactly 180 after tab switches.
2. **No duplication on zoom/pan**: Count stays stable at 197 `.djs-overlay` / 180 `.fpcPropertyOverlay`.
3. **Overlay DOM inflation is real**: +2,770 total nodes (+34.5%) when overlays are enabled.
4. **Canvas is NOT remounted**: `bpmnCanvas` = 2 and `djsContainer` = 1 persist across all tab switches.
