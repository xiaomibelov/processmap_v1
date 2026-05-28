# Zoom Threshold Spec

## Objective
Reduce SVG paint complexity at low zoom levels by simplifying shape rendering.

## Thresholds

| Zoom (scale) | Shape Rendering | Connection Rendering | Label Rendering |
|--------------|-----------------|----------------------|-----------------|
| scale < 0.2 | Hide all inner icons; show only outer bounding `<rect>` | Full (unchanged) | Show |
| 0.2 ≤ scale < 0.5 | Replace detailed icons with simple `<rect>` | Full (unchanged) | Show |
| scale ≥ 0.5 | Full detailed rendering | Full (unchanged) | Show |

## Implementation

### Shape Simplification
1. For each visible `.djs-shape` group:
   - Find detailed icon paths by selector: `.djs-visual > path`, `.djs-visual > circle`, `.djs-visual > polygon`.
   - At zoom < 0.2: set `display: none` on all icon paths. Keep only the first `<rect>` (bounding box).
   - At 0.2 ≤ zoom < 0.5: keep paths but replace complex multi-path icons with a single `<rect>` overlay if feasible.
   - At zoom ≥ 0.5: restore all paths (`display: ''`).

### Label Visibility
- Labels are managed separately by bpmn-js `labelBehavior`.
- Do NOT hide labels via DOM manipulation; let bpmn-js handle label scaling natively.
- If labels become unreadable at zoom < 0.2, that is acceptable product behavior.

### Connection Simplification
- Connections are already lightweight `<path>` elements.
- No change needed for connections at low zoom.

## Verification
- Zoom out to < 20% → shapes must show as simple rectangles.
- Zoom in to > 50% → shapes must show full details.
- No console errors.
- Selection still works on simplified shapes.
