# Engine Evaluation Update

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Question: Can bpmn-js meet real drag target after THIS contour?

### Current State
- bpmn-js Modeler is now default.
- `commandStack.changed` guard suppresses decor fanout during drag.
- `selection.changed` and `canvas.viewbox.changed` guards suppress React updates during drag.
- Remaining SVG rendering is handled by bpmn-js internals.

### Likely Answer
**YES, with caveats.**

For most diagrams, the drag experience should now be acceptable:
- Canvas pan: React-side overhead is suppressed.
- Element drag: Decor fanout is suppressed.
- Modeler default: No 15s wait to enter edit mode.

### Caveats
1. **Very large diagrams** (7,700+ DOM nodes, 2,100+ SVG nodes) may still show SVG-level lag because bpmn-js updates SVG transform attributes synchronously. This is an engine characteristic, not a React issue.
2. **First Modeler init** on large diagrams still takes ~15s. This is a one-time cost per session, not per drag.

### If bpmn-js remains insufficient
Recommend research contour:
- `research/diagram-engine-evaluation-large-bpmn-v1`

Or prototype contour:
- `prototype/diagram-gojs-or-yfiles-large-flow-spike-v1`

---

## Engine Comparison (Updated)

| Engine | License | BPMN XML | Migration Cost | Large Graph Perf | Verdict |
|--------|---------|----------|----------------|------------------|---------|
| **bpmn-js** | MIT | Native | Low | Fair (SVG, ~7k nodes ok) | **Keep optimizing** |
| GoJS | Commercial | Import only | High | Excellent | Evaluate if bpmn-js fails |
| yFiles | Commercial | Import only | High | Excellent | Evaluate if bpmn-js fails |
| JointJS+ | Commercial | Import only | Medium | Good | Lower priority |
| React Flow / XYFlow | MIT | No native | Very High | Good | Not for BPMN XML |
| Custom Canvas/Pixi/Konva | Custom | Custom parser | Extreme | Excellent | Last resort |

### Decision
**Continue bpmn-js optimization.** This contour addressed the main React-side drag bottlenecks. If user still perceives unacceptable lag on large diagrams after Agent 3 verification, open `research/diagram-engine-evaluation-large-bpmn-v1`.

No library install in this contour.

---

## Status
✅ Engine evaluation updated. Decision: continue bpmn-js.
