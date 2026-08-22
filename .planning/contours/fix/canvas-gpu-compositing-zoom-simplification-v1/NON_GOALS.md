# Non-Goals (Strict)

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`

---

## Forbidden Actions

1. **NO viewport culling** — Do NOT remove shapes from DOM. Previous contour `fix/canvas-viewport-culling-v1` was REVERTED because shapes disappeared and scrubber broke.
2. **NO `display:none` on shape root elements** — Hiding the root `.djs-shape` breaks event handling. Child-level `display:none` for icons/markers is allowed.
3. **NO `innerHTML` manipulation** on SVG elements.
4. **NO bpmn-js core modification** — `node_modules/diagram-js/`, `node_modules/bpmn-js/` are read-only.
5. **NO backend changes** — API, storage, schema untouched.
6. **NO overlay debounce changes** — Already completed in `fix/canvas-overlay-debounce-v1`.
7. **NO scrubber/minimap changes** — These were broken by culling; leave untouched.
8. **NO selection/highlight logic changes** — `fpcFocusDim`, `djs-bendpoint`, `djs-outline` must remain functional.
9. **NO package.json changes** — No new dependencies.
10. **NO full WebGL/Canvas rewrite** — Out of scope for this bounded fix.

## Why These Are Forbidden

| Forbidden Approach | Reason |
|-------------------|--------|
| DOM removal / culling | Reverted; breaks scrubber and shape visibility |
| `display:none` on shape roots | Breaks bpmn-js hit testing and selection |
| Core bpmn-js patches | Unmaintainable; upgrade risk |
| Backend changes | Irrelevant to frontend paint cost |
| Overlay debounce | Already solved; would create merge conflicts |

## Safe Approaches

| Approach | Why Safe |
|----------|----------|
| CSS `will-change` / `transform` | Standard browser API; reversible via CSS |
| CSS `contain` | Standard browser API; isolates paint |
| CSS child-level visibility | Does not remove nodes; preserves event targets on parent |
| Zoom-class toggle | Pure CSS/JS; no DOM mutation |
