# Obsidian Context Used — fix/canvas-overlay-regression-emergency-v1

**Run ID**: `20260528T224900Z-21407`  
**Agent**: Agent 1 / Planner

---

## Files Read

| Path | Relevance | Key Facts |
|------|-----------|-----------|
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/PLAN.md` | **Critical** — predecessor contour that introduced regression | Added `will-change: transform`, `contain: layout paint style`, `transform: translateZ(0)` to `.djs-container`/`.djs-canvas`. Added zoom-simplified/minimal CSS classes. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/GPU_COMPOSITING_IMPLEMENTATION.md` | **Critical** | CSS in `legacy_bpmn.css` lines 68–82. JS hooks in `wireBpmnStageRuntimeEvents.js`. `deferUpdate: true` in `BpmnStage.jsx` + `bpmnWiring.js`. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-gpu-compositing-zoom-simplification-v1/REVIEW_BLOCKED.md` | **Critical** | Runtime/source truth mismatch: Vite dev server running from `/app`, not `/opt/processmap-test/frontend`. Reviewer blocked. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-overlay-debounce-v1/DEBOUNCE_IMPLEMENTATION.md` | **High** — stable changes to preserve | `bindOverlayPanDebouncer`, `debounce`, `applyPropertiesOverlayDecorForZoomChangeDebounced`, `deferUpdate: true`. Passed review. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/canvas-overlay-debounce-v1/OVERLAY_CODE_LOCATION.md` | **High** | bpmn-js `Overlays.show()/hide()` manipulates `display`, not `visibility`. Setting `visibility: hidden` on `_overlayRoot` suppresses without removing DOM. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/diagram-property-overlays-performance-gsd-v1/PLAN.md` | **Medium** | Historical context: 3754 SVG nodes, 180 overlays, repaint cost dominates. |

## Search Commands Run

```bash
find /srv/obsidian/project-atlas/ProcessMap -type f -iname '*.md' | xargs grep -il 'overlay\|canvas\|pan\|bpmn'
find /srv/obsidian/project-atlas/ProcessMap/AgentReports -type d -name '*canvas*' -o -name '*overlay*'
```

## Decisions Taken from Obsidian

1. **GPU compositing CSS must be reverted** — `will-change: transform` + `contain` on `.djs-container` breaks bpmn-js overlay absolute positioning during pan.
2. **Zoom simplification CSS must be reverted** — part of same risky contour; not worth keeping during emergency.
3. **Overlay pan debouncer must be preserved** — from `fix/canvas-overlay-debounce-v1`, REVIEW_PASS, stable.
4. **`deferUpdate: true` must be preserved** — from debounce contour, safe.
5. **Emergency priority: stability > performance** — do not attempt partial fixes; surgically remove only GPU compositing and zoom simplification hooks.
