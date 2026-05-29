# Forbidden CSS List

**Контур**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`

---

## STRICTLY FORBIDDEN on `.djs-container`, `.djs-canvas`, or SVG root

| Property | Reason | Previous contour outcome |
|----------|--------|--------------------------|
| `will-change: transform` | Creates compositor layer; breaks overlay positioning during pan | `fix/canvas-gpu-compositing-zoom-simplification-v1` REVERTED |
| `will-change: any` | Same risk — any will-change can promote layer unexpectedly | — |
| `contain: layout` | Isolates layout context; overlays detach from shape positions | `fix/canvas-gpu-compositing-zoom-simplification-v1` REVERTED |
| `contain: paint` | Same risk — clips overlay paint rect | — |
| `contain: layout paint` | Combined risk — overlays disappeared | — |
| `contain: layout paint style` | Same combined risk | — |
| `contain: strict` | Includes layout + paint | — |
| `transform: translateZ(0)` | Forces GPU layer; same overlay issue | — |
| `transform: translate3d(...)` | Forces GPU layer | — |

## STRICTLY FORBIDDEN on shapes / connections

| Pattern | Reason |
|---------|--------|
| `display: none` on `.djs-shape` | Breaks hit-testing, selection, scrubber |
| `visibility: hidden` on `.djs-shape` | Breaks hit-testing |
| `opacity: 0` on `.djs-shape` | May break hit-testing depending on browser |
| Removing DOM nodes (culling) | Breaks scrubber, selection, state |

## ALLOWED (this contour only)

| Property | Target | Why safe |
|----------|--------|----------|
| `shape-rendering: optimizeSpeed` | `.djs-container svg` | Hint only, no layer promotion, no positioning change |
| `shape-rendering: crispEdges` | `.djs-container svg .djs-shape` | Hint only, reduces antialiasing cost |
| `vector-effect: non-scaling-stroke` | `.djs-container svg .djs-connection` | Prevents stroke recalc on zoom, no layer change |

## Verification for Agent 3

- Chrome DevTools → Elements → Computed styles on `.djs-container`:
  - `will-change` must be `auto` (not present).
  - `contain` must not be present.
  - `transform` must not contain `translateZ` or `translate3d`.
- If ANY forbidden property found → `CHANGES_REQUESTED`.
