# RAG Preflight Planner

- run_id: `20260529T000236Z-27528`
- contour: `fix/canvas-shape-rendering-react-audit-v1`
- generated_by: Agent 1 / Planner
- generated_at: 2026-05-29T00:04:30Z

## Commands Run

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "fix/canvas-shape-rendering-react-audit-v1" --area "ProcessMap planning context" --format md --top-k 5
```

## Structured Facts (from RAG)

### Agent Rules
- RAG is read-only suggestion/context layer. Forbidden: auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output.
- Agent 1 Planner must use GSD discipline. Forbidden: skip planning documentation or proceed without bounded scope.
- Agent 3 Reviewer must use GSD discipline. Forbidden: approve without independent validation or skip runtime proof.
- Agent 3 must verify fresh :5180 runtime for UI/runtime work.
- Agent 3 must test the exact user scenario. Forbidden: substitute a different scenario or skip exact reproduction steps.
- Diagram performance review must test real mouse drag, not only programmatic zoom/click.
- No product runtime code changes in RAG tooling contours.

### Relevant Previous Contours (from RAG index)
- `audit/canvas-performance-diagnosis-v1`: confirmed bottleneck — 3754 SVG nodes on 428-element diagram, FPS ~30 during pan. React bundle consumes ~95% CPU during drag.
- `fix/canvas-viewport-culling-v1`: REVERTED — shapes disappeared when leaving viewport, scrubber broke.
- `fix/canvas-overlay-debounce-v1`: REVIEW_PASS — FPS measured ~58.7, but perceived lag remained. Overlay debounce works.
- `fix/canvas-gpu-compositing-zoom-simplification-v1`: REVERTED — overlays disappeared during pan due to `will-change: transform` + `contain: layout paint` on `.djs-container`. Runtime mismatch also observed (dev server from `/app` not `/opt/processmap-test/frontend`).
- `fix/diagram-canvas-reload-loop-and-lag-regression-v1`: investigated skeleton/hydration reload loops, staged hydration state flapping.

### Bottlenecks Identified by RAG
- [Diagram] Diagram drag lag remained after multiple performance contours. Next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. Next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

## Decisions Taken from RAG
1. Previous GPU compositing contour failed because `will-change`/`contain` on `.djs-container` broke overlays — this contour must strictly avoid those properties.
2. Overlay debounce already solved overlay-update cost (FPS ~58.7), but perceived lag remains — pointing to paint cost + React reconciliation as remaining culprits.
3. CSS-only `shape-rendering` optimization is a safe next step because it does not manipulate layers, positioning, or DOM.
4. React re-render audit is critical because prior audit showed React bundle at ~95% CPU during drag.

## Source Files Verified
- `frontend/src/components/process/BpmnStage.jsx` — inspected for `useState`/`setState` patterns; no direct `viewbox` state setter found in top 60 grep hits, but deeper audit required (eventBus listeners, canvas.on callbacks).
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` — overlay debounce code present (from `fix/canvas-overlay-debounce-v1`), no GPU compositing code remains.
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` — already contains `shape-rendering: geometricPrecision` on `.bpmnStage .djs-container svg`.
- Git status: branch `release/consolidation-pr-weekly-v1`, ahead 7 of origin/main. Modified files include `BpmnStage.jsx`, `bpmnWiring.js`.
