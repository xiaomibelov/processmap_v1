# IMPLEMENTATION_NOTES.md — perf/diagram-svg-css-repaint-reduction-v1

## File-by-File Change List

### 1. `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`
**Lines changed**: ~40 rules modified
**Rationale**: Primary source of repaint cost. Contains the most `drop-shadow` rules that apply to SVG shapes and connections.

**Specific changes**:
- **Line ~203**: `.fpcStartEvent` drop-shadow radius 5px → 2px
- **Line ~216**: `.fpcEndEvent` drop-shadow radius 5px → 2px
- **Line ~240**: `.hover:not(.fpcElementSelected)` **removed drop-shadow entirely** (kept stroke color change)
- **Line ~244**: `.fpcElementSelected` **removed drop-shadow entirely** (kept stroke + stroke-width)
- **Line ~248**: `.fpcAnalyticsSelected` **removed drop-shadow entirely** (kept stroke + stroke-width)
- **Lines ~288-367**: Search match/active, coverage ready/warn/risk, node flash accent/ai/notes/sync/flow, focus neighbor/edge — all drop-shadow radii reduced by ~60-70%
- **Line ~415**: `.fpcHasAiQuestion` drop-shadow 6px → 2px
- **Line ~1119**: `.fpcLinkEvent` drop-shadow 5px → 2px
- **Lines ~1140-1224**: Flow tier P0/P1/P2, node path P0/P1/P2, robot meta ready/incomplete, path highlight node/flow, playback node/flow/subprocess — **drop-shadow replaced with `none`** because these are secondary/meta indicators where stroke color alone is sufficient

**Rollback**: Revert any or all of these lines to their previous `drop-shadow(...)` values. No JS dependencies.

### 2. `frontend/src/styles/app/04/04-03-llm-bottlenecks.css`
**Lines changed**: ~10 rules modified
**Rationale**: Duplicates and extends some selection/highlight rules from 05-02. Removing redundant drop-shadow here prevents double-painting.

**Specific changes**:
- **Line ~663**: `.fpcReportStopMarker` drop-shadow 7px → 2px
- **Line ~725**: `.fpcNodeFocus` drop-shadow 8px → 2px
- **Line ~732**: `.fpcQualityIssueFocus` drop-shadow 10px → 3px
- **Line ~739**: `.fpcAttentionJumpFocus` drop-shadow 13px → 4px
- **Lines ~745, 748, 751**: `@keyframes fpcAttentionJumpPulse` keyframes reduced (4px→2px, 16px→5px, 13px→4px)
- **Line ~759**: `.fpcQualityProblem` drop-shadow 8px → 3px
- **Line ~765**: `.fpcElementSelected` **removed drop-shadow entirely**
- **Line ~771**: `.djs-connection.fpcElementSelected` **removed drop-shadow entirely**

**Rollback**: Same as 05-02 — revert individual lines.

### 3. `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`
**Lines changed**: 4 rules modified
**Rationale**: Context-pad and popup box-shadow blur radii were large (8px-26px) even though these elements are few. Reduced to minimize composite layer cost when context pad is visible.

**Specific changes**:
- **Line ~125**: `.djs-context-pad .entry, .djs-popup .entry` box-shadow 0 8px 26px → 0 2px 8px
- **Line ~197**: `.dark .djs-context-pad .entry, .dark .djs-popup .entry` box-shadow 0 8px 24px → 0 2px 8px
- **Lines ~324-327**: `.dark .djs-palette` box-shadow 0 10px 28px → 0 4px 10px
- **Lines ~353-356**: `.light .djs-palette` box-shadow 0 10px 24px → 0 4px 10px

**Rollback**: Revert box-shadow values to previous blur/spread.

## What Was NOT Changed

- `BpmnStage.jsx` / `ProcessStage.jsx` — no god-file bloat
- `selectionFocusDecor.js` — edit-mode mass dimming untouched (outside scope)
- `applyAnalyticsSelectionHighlight.js` — single-marker API unchanged
- `tailwind.css` — no expensive BPMN canvas rules found
- Backend files — none touched
- `package.json` / `package-lock.json` — no dependency changes
- BPMN XML — untouched

## Decomposition
No decomposition required. All changes were CSS-only in existing dedicated style modules.

## Known Limitations
- Start/end events still show a 2px drop-shadow in base state because `.fpcStartEvent`/`.fpcEndEvent` rules use `:first-child` which has higher specificity than `.fpcAnalyticsSelected`. To fully remove this, the start/end rules would need restructuring, which was deemed out of scope for this bounded contour.
- The `transition: all` observed in computed styles comes from bpmn-js internals, not our CSS. We cannot remove it without patching bpmn-js.
- No precise paint-timing metrics were captured (DevTools Performance trace not available via Playwright). Evidence relies on computed-style inspection + DOM stability + source proof.
