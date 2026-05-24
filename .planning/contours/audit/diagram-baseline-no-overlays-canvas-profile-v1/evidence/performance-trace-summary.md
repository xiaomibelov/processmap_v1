# Performance Trace Summary

## Status
**Chrome DevTools performance trace was NOT captured** in this session.

Playwright trace was not enabled. The following analysis is inferred from DOM/SVG counts and source code review.

## Inferred Cost Breakdown

### Selection Cost Distribution (inferred)

| Cost Category | Estimated % | Evidence |
|---------------|------------|----------|
| **SVG node creation** (bpmn-js modeler handles, bendpoints, draggers) | ~50% | +916 `.djs-bendpoint`, +251 `.djs-segment-dragger` elements created |
| **Style recalculation** (`fpcFocusDim` class on ~250 elements) | ~25% | CSS selector `.fpcFocusDim .djs-visual > :is(rect, circle, ...)` triggers recalc on ~250 SVG shapes |
| **Layout** (new SVG elements need bounding boxes) | ~15% | 3,186 new SVG nodes require layout computation |
| **Scripting** (decor pipeline, effect execution) | ~10% | `applySelectionFocusDecor` iterates all ~276 elements; fanout effects may fire |

### Pan/Zoom Cost Distribution (inferred)

| Cost Category | Estimated % | Evidence |
|---------------|------------|----------|
| **SVG transform update** | ~70% | `canvas.viewbox.changed` triggers SVG viewport transform |
| **RAF scheduling** | ~20% | `scheduleRafForInstance` coalesces overlay refresh (now cleaned up) |
| **Scripting** | ~10% | EventBus handlers, `emitViewboxChanged` callbacks |

### Hover Cost Distribution (inferred)

| Cost Category | Estimated % | Evidence |
|---------------|------------|----------|
| **CSS :hover styles** | ~80% | bpmn-js native hover styles on `.djs-element` |
| **Scripting** | ~20% | Potential tooltip/overlay hover handlers |

## Long Tasks (inferred)

Based on DOM inflation magnitude, selection likely produces a **Long Task** (>50ms) consisting of:
1. bpmn-js `selection.changed` handler execution
2. `canvas.addMarker` loop over ~250 elements
3. Browser style recalculation across 5,500+ SVG nodes
4. Layout of 3,186 new SVG nodes
5. Paint/composite of the entire canvas

## Recommendation for Future Traces

If a future contour enables Chrome tracing, capture:
- `Scripting` time in `BpmnStage.jsx:applySelectionFocusDecor`
- `Rendering` time for SVG node creation
- `Painting` time for `fpcFocusDim` opacity changes
- `Layout` time for new bendpoint/segment-dragger elements

## Fallback Conclusion

Without direct trace data, the strongest evidence points to **SVG node creation + style recalculation** as the dominant cost. The +3,186 SVG nodes created on selection represent a ~133% increase in the SVG subtree, which the browser must layout, style, and paint.
