# CSS Optimization Spec

**Контур**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`

---

## What to add

```css
/* Target the SVG root inside bpmn-js canvas */
.djs-container svg {
  shape-rendering: optimizeSpeed;
}

/* Optional: non-scaling stroke prevents stroke-width recalculation on zoom */
.djs-container svg .djs-connection {
  vector-effect: non-scaling-stroke;
}

/* Optional: crisp edges for shapes (less anti-aliasing cost) */
.djs-container svg .djs-shape {
  shape-rendering: crispEdges;
}
```

## Where to add

Preferred: `frontend/src/styles/legacy/legacy_bpmn.css`  
Alternative: `frontend/src/index.css` or a new `frontend/src/styles/bpmn-overrides.css`

## Why safe

- Pure CSS, no DOM manipulation.
- No positioning changes.
- No layer promotion (`will-change`, `translateZ`).
- `shape-rendering` is a hint; browser ignores if unsupported.
- Overlays are HTML elements outside SVG, unaffected.

## Existing rules to check

Current codebase has:
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css:63` — `shape-rendering: geometricPrecision;`
- `frontend/src/styles/app/02/02-02-bpmn-viewer-core.css` — `.bpmnStage .djs-container svg` rules
- `frontend/src/styles/legacy/legacy_bpmn.css` — `.bpmnStage .bpmnCanvas .djs-container svg` rules

If any existing rule sets `shape-rendering`, the new rule must have **equal or higher specificity** to override.

## Conflict resolution

If `shape-rendering: geometricPrecision` exists on the same selector:
- Keep `optimizeSpeed` as the final value.
- Do not remove `geometricPrecision` from dark-theme unless it conflicts — just override with equal specificity in the same file or a later-loaded file.

## Verification

- Chrome DevTools → Elements → Computed → `shape-rendering` on any `.djs-shape` or SVG path must show `optimizeSpeed` or `crispEdges`.
- No console CSS errors.
