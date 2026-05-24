# Engine Evaluation — fix/diagram-real-drag-performance-and-engine-decomposition-v1

## Scope
Evaluate alternative diagram engines for large BPMN canvas (7,700+ DOM nodes, 2,100+ SVG nodes) on clearvestnic.ru:5180.

No library installation or migration in this contour.

## Current Engine: bpmn-js (NavigatedViewer + Modeler)

### Pros
- Native BPMN 2.0 XML import/export
- Deep existing integration (decor, overlays, analytics selection, property panel)
- Mature editing palette, bendpoints, segment draggers
- Large community, active maintenance
- Viewer/Modeler split already implemented

### Cons
- SVG-based rendering stacks ~2,100 SVG nodes for large diagrams
- Real mouse drag produces 20–34 long tasks (>50ms) per drag session
- Modeler init ~15s on large diagram
- Viewbox changes trigger full SVG coordinate updates

### Verdict for this contour
**Primary**: Continue optimizing bpmn-js drag pipeline first.
Evidence: suppressing React-side `viewbox.changed` and `selection.changed` handlers during drag reduced long-task burden by ~54%. This proves a significant portion of drag lag was overhead, not engine limit.

However, remaining ~20 long tasks per drag (total ~2,850ms) suggest SVG coordinate recalculation is still heavy. This is an **engine characteristic**, not a bug.

## Alternative Engines Evaluated

### GoJS
- **Pros**: Canvas-based rendering, BPMN sample diagrams, rich interaction model, proven large-graph performance
- **Cons**: Commercial license (~$10k+/yr); no native BPMN XML import/export (must build mapping); high migration cost (all decor, overlays, selection, property panel need rewrite)
- **Verdict**: Evaluate only. If bpmn-js remains insufficient after full optimization, recommend `prototype/diagram-gojs-or-yfiles-large-flow-spike-v1`

### yFiles
- **Pros**: Strong large-graph performance documentation, mature interaction, layout algorithms
- **Cons**: Commercial license; BPMN semantics mapping required; high migration cost
- **Verdict**: Evaluate only. Strong candidate if spike contour is approved.

### JointJS+ (Rappid)
- **Pros**: BPMN import/export plugin in commercial tier
- **Cons**: Commercial license; migration/integration cost comparable to GoJS/yFiles; smaller community than bpmn-js
- **Verdict**: Evaluate only. No compelling advantage over GoJS/yFiles.

### React Flow / XYFlow
- **Pros**: React-native, good for workflow UI
- **Cons**: Not BPMN-native; large graph performance unproven at 2,100+ node scale; XML mapping required
- **Verdict**: Reject for BPMN editor replacement. Could be useful for simplified analytics view only.

### Custom Canvas (Pixi/Konva/WebGL)
- **Pros**: Maximum performance control, useful for analytics/LLM overlay
- **Cons**: Not a BPMN editor without massive custom work (palette, bendpoints, XML round-trip, undo/redo)
- **Verdict**: Reject for editor replacement. Consider for read-only analytics overlay in future contour.

## Decision

1. **Continue with bpmn-js** for the current editor.
2. The drag performance fix in this contour (suppressing React updates during drag) provided material improvement.
3. If user still reports subjective lag after this contour, recommend a **research/prototype contour**:
   - `research/diagram-engine-evaluation-large-bpmn-v1` — deep benchmark of GoJS vs yFiles with actual BPMN XML load
   - `prototype/diagram-gojs-or-yfiles-large-flow-spike-v1` — limited prototype with 1–2 BPMN diagrams

## Evidence
- Before fix: 34 long tasks, 6,244ms total during drag
- After fix: 20 long tasks, 2,848ms total during drag
- Remaining lag correlates with bpmn-js SVG viewport transform updates, not React churn
