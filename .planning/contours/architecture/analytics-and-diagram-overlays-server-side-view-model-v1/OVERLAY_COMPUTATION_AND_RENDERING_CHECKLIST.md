# Overlay computation and rendering checklist

Run ID: `20260519T090224Z-17699`

## Server-side computation

- [ ] Overlay API returns element-level view-models, not DOM/HTML.
- [ ] Response includes `element_id`, `kind`, `priority`, `summary`, `details`, `source`, `source_version`, `read_only`.
- [ ] Response includes stable signature for frontend dedupe.
- [ ] Response can be filtered by scope/module/kind.
- [ ] Later viewport endpoint is explicitly marked feasibility target.

## Frontend rendering

- [ ] Render only visible/relevant overlays.
- [ ] Use viewport culling with buffer.
- [ ] Use zoom thresholds for label/detail density.
- [ ] Use hover/selection detail mode.
- [ ] Avoid mass bpmn-js `overlays.add()` calls.
- [ ] Avoid generating hidden DOM for all elements.
- [ ] Pan/zoom updates must not force full React re-render when imperative sync is enough.
- [ ] Overlay viewing must be read-only.

## Review gates

- [ ] Plan distinguishes data computation cost from DOM/SVG rendering cost.
- [ ] Reviewer can identify max expected overlay DOM count strategy.
- [ ] Reviewer can identify mutation boundary for BPMN XML/Product Actions.
