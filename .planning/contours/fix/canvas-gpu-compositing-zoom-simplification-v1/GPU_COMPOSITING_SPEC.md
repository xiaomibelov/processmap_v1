# GPU Compositing Spec

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`

---

## Objective
Force the browser to composite the entire bpmn-js SVG canvas on a GPU layer during pan, eliminating CPU paint cost.

## CSS Rules

### Global rules (always active)
```css
.djs-container svg,
.djs-canvas svg {
  will-change: transform;
  transform: translateZ(0);
}

.djs-container {
  contain: layout paint style;
}
```

### Active-pan rules (only during pan)
```css
.djs-canvas.pan-active {
  will-change: transform;
  contain: layout paint;
}
```

## JavaScript Hook

Add in `BpmnStage.jsx` or `wireBpmnStageRuntimeEvents.js`:

```javascript
let panTimeout = null;
const container = /* root DOM node of bpmn-js canvas */;

// Use modeler/viewer instance event bus
const canvas = modeler.get('canvas');
const eventBus = modeler.get('eventBus');

// Option 1: via eventBus (preferred)
eventBus.on('canvas.viewbox.changing', () => {
  container.classList.add('pan-active');
  clearTimeout(panTimeout);
});

eventBus.on('canvas.viewbox.changed', () => {
  clearTimeout(panTimeout);
  panTimeout = setTimeout(() => {
    container.classList.remove('pan-active');
  }, 100);
});
```

**Why 100ms debounce**: prevents flicker when user pauses briefly between drag motions.

## DevTools Verification

1. Open Chrome DevTools → **Layers** panel.
2. Start panning the canvas.
3. **Expected**: `.djs-container` or its `<svg>` appears as a separate compositor layer (highlighted in the layer tree).
4. Open **Performance** panel, record during pan.
5. **Expected**: "Paint" events are minimal or absent; main cost is "Composite Layers".

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `will-change` consumes GPU memory | Remove class after pan ends; do not apply permanently to entire page |
| `translateZ(0)` causes blurry text on some GPUs | Use `will-change: transform` instead if blur observed; test on target hardware |
| `contain: layout` clips positioned children | Verify overlays/popups still render correctly; if clipped, reduce to `contain: paint` only |

## Target Files
- `frontend/src/components/process/BpmnStage.jsx` — add event listeners.
- `frontend/src/styles/app.css` or `frontend/src/styles/legacy/legacy_bpmn.css` — add CSS rules.
