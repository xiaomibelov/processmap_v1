# RAG Preflight — Planner

**Contour**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Role**: planner  
**Generated**: 2026-05-28T19:05:01Z

## Command
```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "fix/canvas-overlay-debounce-v1" --area "ProcessMap planning context" --format md --top-k 5
```

## Key Facts Used

| Fact | Source | Decision Impact |
|------|--------|-----------------|
| RAG is read-only suggestion layer; forbidden to auto-mutate code | Agent Rules (critical) | Planner will not write product code; only planning artifacts |
| Agent 1 must use GSD discipline, bounded scope, PLAN.md, STATE.json | Agent Rules (critical) | All required planning files will be created |
| `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` formal=REVIEW_PASS, user_visible=not_solved | Contour Facts | Previous drag perf contours did not solve the issue; new approach needed |
| `fix/diagram-real-drag-performance-and-engine-decomposition-v1` formal=REVIEW_PASS, user_visible=not_solved | Contour Facts | Engine decomposition contour also not solved; overlay debounce is a focused alternative |
| Diagram drag lag remained after multiple performance contours → next: `perf/process-stage-baseline-jank-v1` | Bottlenecks | Overlay debounce targets the jank specifically during pan |
| React bundle consumes ~95% CPU during diagram drag | Bottlenecks | Debouncing overlay updates should reduce React re-render churn and free CPU |
| No runtime facts matched query | Warnings | Worker must establish fresh runtime proof on :5177 |

## Decisions Changed / Confirmed
- **Confirmed**: Do not write product code as Planner.
- **Confirmed**: Bounded scope = overlay debounce only; no viewport culling.
- **Confirmed**: Acceptance criteria must include FPS target and runtime proof.

## Suggested Next Queries (for Worker)
- `node tools/rag/pm-rag-search.mjs "overlay viewbox changed debounce BPMN" --top-k 5`
- `node tools/rag/pm-rag-search.mjs "useBpmnSettledDecorFanout requestAnimationFrame" --top-k 5`
