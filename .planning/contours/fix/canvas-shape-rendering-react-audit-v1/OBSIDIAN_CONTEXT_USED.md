# Obsidian Context Used

- run_id: `20260529T000236Z-27528`
- contour: `fix/canvas-shape-rendering-react-audit-v1`
- generated_by: Agent 1 / Planner
- generated_at: 2026-05-29T00:05:00Z
- obsidian_root: `/srv/obsidian/project-atlas/ProcessMap`
- obsidian_root_exists: `yes`

## Files Read

| # | File Path | Relevance | Decision Taken |
|---|-----------|-----------|----------------|
| 1 | `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/PLAN.md` | High — previous contour with same goal (GPU compositing + zoom simplification) | GPU compositing with `will-change`/`contain` on `.djs-container` caused overlay disappearance — FORBIDDEN in this contour |
| 2 | `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/WORKER_REPORT.md` | High — implementation details of reverted contour | Confirmed `deferUpdate: true` already added; overlay debounce already integrated; GPU compositing code was in `legacy_bpmn.css` and `wireBpmnStageRuntimeEvents.js` — all reverted |
| 3 | `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/REVIEW_REPORT.md` | High — why it was blocked/reverted | Runtime mismatch (`/app` vs `/opt/processmap-test/frontend`) + overlay disappearance due to `will-change`/`contain` on `.djs-container` |
| 4 | `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/REVIEW_BLOCKED.md` | High — runtime mismatch evidence | Dev server `:5177` running from `/app` not project root; served bundles lacked changes. Must ensure build is served from correct directory |
| 5 | `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-overlay-debounce-v1/WORKER_REPORT.md` | High — prior successful contour | Overlay debounce achieved 58.7 FPS on large diagram, 60 FPS on small, long tasks reduced to ~90 ms. Perceived lag remained — proves overlay updates were not the only bottleneck |
| 6 | `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-canvas-reload-loop-and-lag-regression-v1/PLAN.md` | Medium — related canvas lag investigation | Confirmed `BpmnStage.jsx` has complex state machine (`diagramReady`, `useDiagramStagedHydration`, `useDeferredDecorFanout`). Hypothesis H3: BpmnStage key/props instability causes remount. React DevTools Profiler recommended |

## Search Commands

```bash
find /srv/obsidian/project-atlas/ProcessMap -type f -name '*.md' | xargs grep -l -i 'canvas\|overlay\|bpmn\|shape.rendering\|will-change\|compositing\|GPU\|FPS\|performance\|viewbox' 2>/dev/null | head -20

find /srv/obsidian/project-atlas/ProcessMap -type f -name '*.md' | xargs grep -l -i 'canvas-viewport-culling\|canvas-overlay-debounce\|canvas-gpu-compositing\|shape-rendering\|react.*render\|setState.*viewbox' 2>/dev/null | head -20
```

## Key Decisions from Obsidian
1. **GPU compositing is forbidden** — previous attempt with `will-change`/`contain`/`translateZ` on `.djs-container` broke overlays. This contour uses only `shape-rendering` (SVG hint) which does not create compositor layers.
2. **Overlay debounce already works** — do not modify overlay logic. Keep existing `wireBpmnStageRuntimeEvents.js` debounce intact.
3. **React re-render audit is high-value** — prior contours identified React bundle at ~95% CPU during drag. `BpmnStage.jsx` state machine complexity suggests `setState` may fire on pan events.
4. **Runtime serving check required** — previous contour blocked by dev server running from wrong CWD. Agent 3 must verify `:5177` serves current build.
