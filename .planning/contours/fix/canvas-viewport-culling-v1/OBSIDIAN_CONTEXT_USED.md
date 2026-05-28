# Obsidian Context Used

- run_id: `20260528T084215Z-64895`
- contour: `fix/canvas-viewport-culling-v1`
- generated_by: `agent-1-planner`
- generated_at: `2026-05-28T08:45:09Z`
- obsidian_root: `/srv/obsidian/project-atlas/ProcessMap`
- obsidian_root_exists: `yes`

## Files Actually Read

| # | File | Relevance | Decision Taken |
|---|------|-----------|----------------|
| 1 | `Audits/Diagram Baseline No Overlays Canvas Profile.md` | Confirms SVG/DOM inflation on selection (+3186 SVG nodes). Selection triggers `fpcFocusDim` and bendpoint rendering. | Focus culling must also consider editor-mode selection handles; but primary target is base SVG shapes. |
| 2 | `Audits/Diagram Property Overlays Performance Audit.md` | Prior audit identifying overlay DOM inflation (+34.5%). P1 rec #3: "Viewport-cull overlays in decorManager.js". | Property overlay culling already implemented in `perf/diagram-property-overlays-viewport-culling-v1`. This contour must cull **main SVG shapes/connections**, not overlays. |
| 3 | `AgentReports/perf/diagram-property-overlays-viewport-culling-v1/PLAN.md` | Full plan of prior overlay-only culling. File map: `decorManager.js`, `BpmnStage.jsx`, `overlayLayoutModel.js`, `wireBpmnStageRuntimeEvents.js`. | Architecture for viewbox signature and intersection math is proven. Worker can reuse coordinate transformation patterns but must target `.djs-shape`/`.djs-connection` instead of `.fpcPropertyOverlay`. |
| 4 | `AgentReports/perf/diagram-property-overlays-viewport-culling-v1/EXEC_REPORT.md` | Results: overlays reduced 180→70. Pan-aware trigger works. | Confirms viewport culling approach is viable. BUT: main SVG nodes (3754) are untouched by overlay culling. |
| 5 | `AgentReports/perf/diagram-property-overlays-viewport-culling-v1/REVIEW_REPORT.md` | REVIEW_PASS. No duplicates, stable counts, no console errors. | Reviewer criteria for this contour should mirror prior success: stable counts, no duplicates, no console errors. |
| 6 | `.planning/contours/audit/canvas-performance-diagnosis-v1/AUDIT_REPORT.md` | **Primary evidence.** Verdict: DOM/SVG creation is sole bottleneck. 3754 SVG nodes on large diagram. Long tasks 148ms. | Fix strategy validated: reduce rendered SVG nodes via viewport culling. |
| 7 | `.planning/contours/audit/canvas-performance-diagnosis-v1/PLAN.md` | Architecture map: BpmnStage.jsx = Canvas Host, decorManager.js = Overlay Manager. | Bounded scope: frontend only, `BpmnStage.jsx` and bpmn-js integration layer. |

## Search Commands Run

```bash
find /srv/obsidian/project-atlas/ProcessMap -type f -name '*.md' | xargs grep -il -E 'canvas|viewport|culling|performance|BPMN|diagram|lag|FPS|SVG|DOM'
ls -la /srv/obsidian/project-atlas/ProcessMap/Audits/
ls -la /srv/obsidian/project-atlas/ProcessMap/Contours/
```

## Summary

- Prior contour `perf/diagram-property-overlays-viewport-culling-v1` successfully culled **property overlays** (`.fpcPropertyOverlay`) but did NOT reduce base SVG shapes.
- Current audit proves base SVG node creation (3754 nodes for 428 elements) is the sole bottleneck.
- This contour must implement viewport culling for **bpmn-js SVG elements** (`.djs-shape`, `.djs-connection`) via the React wrapper, without modifying bpmn-js core.
