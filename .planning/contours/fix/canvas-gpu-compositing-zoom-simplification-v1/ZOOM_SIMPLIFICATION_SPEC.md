# Zoom Simplification Spec

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`

---

## Objective
Reduce SVG path count at low zoom levels where detail is invisible anyway, lowering paint cost without removing DOM nodes.

## Zoom Thresholds

| Zoom | Shape Rendering | Connection Rendering | Labels |
|------|----------------|---------------------|--------|
| ≥ 0.4 | Full (icons, borders, markers, fills) | Full (routed paths) | All visible |
| < 0.4 | Simplified (rect + text only, no icons, no corner markers) | Full | All visible |
| < 0.3 | Simplified shapes | Straight lines (if applicable via CSS) | All visible |
| < 0.2 | Simplified shapes | Straight lines | Connection labels hidden |

## Implementation Approach

### Preferred: CSS Class-Based Visibility (lowest risk, no renderer modification)

Apply a zoom-level CSS class to the bpmn-js container based on current viewbox scale:

```javascript
const scale = canvas.viewbox().scale;
const container = /* .djs-container */;
container.classList.remove('zoom-full', 'zoom-simplified', 'zoom-minimal');
if (scale < 0.2) {
  container.classList.add('zoom-minimal');
} else if (scale < 0.4) {
  container.classList.add('zoom-simplified');
} else {
  container.classList.add('zoom-full');
}
```

Corresponding CSS:

```css
/* Zoom < 0.4: hide icons and corner markers */
.djs-container.zoom-simplified .djs-visual path[d*="icon"],
.djs-container.zoom-simplified .djs-visual .djs-visual-icon,
.djs-container.zoom-simplified .djs-visual image,
.djs-container.zoom-simplified .djs-shape > .djs-visual > :not(rect):not(text) {
  display: none;
}

/* Zoom < 0.2: hide connection labels */
.djs-container.zoom-minimal .djs-connection .djs-label {
  display: none;
}
```

**Note**: `display: none` on SVG children is allowed because it does NOT remove nodes from DOM; it only removes them from the render tree.

### Fallback: Custom Renderer Hook (if CSS approach insufficient)

If bpmn-js SVG structure makes CSS selectors unreliable, add a lightweight custom renderer module:

```javascript
// In BpmnStage config or module extension
if (zoom < 0.4) {
  // Skip icon rendering in drawShape
  // Skip marker rendering
  // Use simpler border path
}
```

## Interaction Preservation Requirements

- **Click selection** must work at all zoom levels.
- **Hover states** must work at all zoom levels.
- **Context menu** must work at all zoom levels.
- **Drag/move** must work at all zoom levels.

## Verification

1. Load large diagram (428 elements).
2. Zoom to 30%.
3. Inspect SVG DOM: count of `.djs-visual` children per shape should be lower (no `<image>`, no complex path icons).
4. Zoom to 15%: connection labels should not be visible.
5. Zoom back to 100%: full detail must restore instantly.

## Target Files
- `frontend/src/components/process/BpmnStage.jsx` — zoom class toggle logic.
- `frontend/src/styles/app.css` or component CSS — zoom-level rules.
- Optional: custom renderer module if CSS approach is insufficient.
