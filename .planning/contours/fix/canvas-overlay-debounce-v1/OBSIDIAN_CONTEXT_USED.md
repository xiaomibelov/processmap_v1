# Obsidian Context Used

**Contour**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Date**: 2026-05-28

## Files Read

### 1. `Diagram Property Overlays Performance Audit.md`
- **Path**: `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Property Overlays Performance Audit.md`
- **Relevance**: Directly supports overlay debounce scope
- **Key findings**:
  - Property overlays increase total DOM nodes by **34.5%** (+2,770 nodes)
  - 180 `.fpcPropertyOverlay` containers when `alwaysEnabled=true`
  - Each overlay applies 8+ inline CSS properties and builds a full table
- **Decision taken**: P1 recommendation #5 — "Coalesce overlay triggers with `requestAnimationFrame` in `useBpmnSettledDecorFanout`" — this is exactly the debounce/throttle approach for this contour
- **Decision taken**: P1 recommendation #3 (viewport-cull overlays) is explicitly **rejected** for this contour per user non-goals

### 2. `Diagram Baseline No Overlays Canvas Profile.md`
- **Path**: `/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Baseline No Overlays Canvas Profile.md`
- **Relevance**: Confirms baseline behavior and other bottlenecks
- **Key findings**:
  - Element selection triggers massive SVG/DOM inflation (+3,200 nodes, ~+40%)
  - `BpmnStage.jsx:applySelectionFocusDecor` (lines 2068–2126) iterates ALL selectable elements O(n)
  - `useBpmnSettledDecorFanout.js` — Properties fanout fires unconditionally even when overlays off
  - `useProcessStageLocalState.js` — object spread causes re-render churn
- **Decision taken**: Worker must verify `useBpmnSettledDecorFanout.js` is the primary target for debounce; must NOT touch `applySelectionFocusDecor` unless directly related to overlay repositioning during pan
- **Decision taken**: Primary next contour per audit was `fix/diagram-decor-pipeline-disable-when-overlays-off-v1`; this contour (`fix/canvas-overlay-debounce-v1`) is a focused subset addressing the pan-time overlay repositioning specifically

## Search Commands Used
```bash
ls /srv/obsidian/project-atlas/ProcessMap/Audits/ | grep -i "canvas\|performance\|diagram"
cat "/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Baseline No Overlays Canvas Profile.md"
cat "/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Property Overlays Performance Audit.md"
```

## Notes Not Applicable
- No other Obsidian notes contained specific guidance on `canvas-overlay-debounce` contour.
