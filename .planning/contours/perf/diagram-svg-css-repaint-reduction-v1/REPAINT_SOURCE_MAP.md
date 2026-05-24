# REPAINT_SOURCE_MAP.md — perf/diagram-svg-css-repaint-reduction-v1

## File: `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`

### Rules with `filter: drop-shadow(...)` — Before and After

| Selector | Before | After | Trigger | Cost Impact |
|----------|--------|-------|---------|-------------|
| `.fpcStartEvent .djs-visual > circle:first-child` | `drop-shadow(0 0 5px ...)` | `drop-shadow(0 0 2px ...)` | Base style | Medium |
| `.fpcEndEvent .djs-visual > circle:first-child` | `drop-shadow(0 0 5px ...)` | `drop-shadow(0 0 2px ...)` | Base style | Medium |
| `.djs-element.hover:not(.fpcElementSelected) .djs-visual > :is(...)` | `drop-shadow(0 0 4px ...)` | **removed** | Hover | **High** |
| `.djs-element.fpcElementSelected .djs-visual > :is(...)` | `drop-shadow(0 0 8px ...)` | **removed** | Edit selection | **High** |
| `.djs-element.fpcAnalyticsSelected .djs-visual > :is(...)` | `drop-shadow(0 0 8px ...)` | **removed** | Analytics selection | **High** |
| `.fpcSearchMatch ... .djs-visual > :is(...)` | `drop-shadow(0 0 5px ...)` | `drop-shadow(0 0 2px ...)` | Search match | Low |
| `.fpcSearchActive ... .djs-visual > :is(...)` | `drop-shadow(0 0 8px ...)` | `drop-shadow(0 0 3px ...)` | Search active | Low |
| `.fpcSearchActive connection ...` | `drop-shadow(0 0 7px ...)` | `drop-shadow(0 0 3px ...)` | Search active | Low |
| `.fpcCoverageReady ...` | `drop-shadow(0 0 5px ...)` | `drop-shadow(0 0 2px ...)` | Coverage ready | Low |
| `.fpcCoverageWarn ...` | `drop-shadow(0 0 6px ...)` | `drop-shadow(0 0 2px ...)` | Coverage warn | Low |
| `.fpcCoverageRisk ...` | `drop-shadow(0 0 7px ...)` | `drop-shadow(0 0 2px ...)` | Coverage risk | Low |
| `.fpcNodeFlashAccent ...` | `drop-shadow(0 0 10px ...)` | `drop-shadow(0 0 3px ...)` | Flash accent | Low |
| `.fpcNodeFlashAi ...` | `drop-shadow(0 0 11px ...)` | `drop-shadow(0 0 3px ...)` | Flash AI | Low |
| `.fpcNodeFlashNotes ...` | `drop-shadow(0 0 10px ...)` | `drop-shadow(0 0 3px ...)` | Flash notes | Low |
| `.fpcNodeFlashSync ...` | `drop-shadow(0 0 10px ...)` | `drop-shadow(0 0 3px ...)` | Flash sync | Low |
| `.fpcNodeFlashFlow ...` | `drop-shadow(0 0 10px ...)` | `drop-shadow(0 0 3px ...)` | Flash flow | Low |
| `.fpcFocusNeighbor ...` | `drop-shadow(0 0 6px ...)` | `drop-shadow(0 0 2px ...)` | Edit focus neighbor | Low |
| `.fpcFocusEdgePrimary ...` | `drop-shadow(0 0 6px ...)` | `drop-shadow(0 0 2px ...)` | Edit focus edge | Low |
| `.fpcHasAiQuestion ...` | `drop-shadow(0 0 6px ...)` | `drop-shadow(0 0 2px ...)` | AI question | Low |
| `.fpcLinkEvent ... circle:first-child` | `drop-shadow(0 0 5px ...)` | `drop-shadow(0 0 2px ...)` | Link event | Low |
| `.fpcFlowTierP0 connection ...` | `drop-shadow(0 0 2px ...)` | **none** | Flow tier | Low |
| `.fpcFlowTierP1 connection ...` | `drop-shadow(0 0 2px ...)` | **none** | Flow tier | Low |
| `.fpcFlowTierP2 connection ...` | `drop-shadow(0 0 2px ...)` | **none** | Flow tier | Low |
| `.fpcNodePathP0 ...` | `drop-shadow(0 0 1px ...)` | **none** | Path tag | Low |
| `.fpcNodePathP1 ...` | `drop-shadow(0 0 1px ...)` | **none** | Path tag | Low |
| `.fpcNodePathP2 ...` | `drop-shadow(0 0 1px ...)` | **none** | Path tag | Low |
| `.fpcRobotMetaReady ...` | `drop-shadow(0 0 1px ...)` | **none** | Robot meta | Low |
| `.fpcRobotMetaIncomplete ...` | `drop-shadow(0 0 1px ...)` | **none** | Robot meta | Low |
| `.fpcPathHighlightNode ...` | `drop-shadow(0 0 2px ...)` | **none** | Path highlight | Low |
| `.fpcPathHighlightFlow ...` | `drop-shadow(0 0 2px ...)` | **none** | Path highlight | Low |
| `.fpcPlaybackNodeActive ...` | `drop-shadow(0 0 2px ...)` | **none** | Playback | Low |
| `.fpcPlaybackFlowActive ...` | `drop-shadow(0 0 2px ...)` | **none** | Playback | Low |
| `.fpcPlaybackSubprocessActive ...` | `drop-shadow(0 0 3px ...)` | **none** | Playback | Low |

### Rules with `box-shadow` — mostly overlay/badge/pill UI (not SVG canvas)
- `fpcNodeBadge`, `fpcNodeBadge:hover`, `fpcNodeBadge:focus-visible` — kept, these are HTML overlay badges
- `fpcPropertyRow`, `fpcPropertyRow--linked` — kept, these are HTML property overlay rows
- `fpcNodeFlashPill` — kept, HTML pill overlay
- `fpcPlaybackPill`, `fpcPlaybackBranchTag`, `fpcPlaybackSubprocessTag` — kept, HTML pills
- `fpcAiQuestionPanel` — kept, HTML panel
- `fpcAiQuestionComment:focus` — kept, HTML input focus
- `fpcAiQuestionIndicator`, `:hover`, `:focus-visible` — kept, HTML indicator

### Rules with `transition`
- `.fpcNodeBadge` — `transform .12s, box-shadow .12s` — kept (HTML overlay, not SVG)
- `.fpcAiQuestionIndicator` — `transform .12s, box-shadow .12s, background-color .12s` — kept (HTML overlay)

## File: `frontend/src/styles/app/04/04-03-llm-bottlenecks.css`

| Selector | Before | After | Trigger | Cost Impact |
|----------|--------|-------|---------|-------------|
| `.fpcReportStopMarker ...` | `drop-shadow(0 0 7px ...)` | `drop-shadow(0 0 2px ...)` | Report stop | Low |
| `.fpcNodeFocus ...` | `drop-shadow(0 0 8px ...)` | `drop-shadow(0 0 2px ...)` | Node focus | Low |
| `.fpcQualityIssueFocus ...` | `drop-shadow(0 0 10px ...)` | `drop-shadow(0 0 3px ...)` | Quality focus | Low |
| `.fpcAttentionJumpFocus ...` | `drop-shadow(0 0 13px ...)` | `drop-shadow(0 0 4px ...)` | Jump focus | Medium |
| `@keyframes fpcAttentionJumpPulse 0%` | `drop-shadow(0 0 4px ...)` | `drop-shadow(0 0 2px ...)` | Jump animation | Low |
| `@keyframes fpcAttentionJumpPulse 55%` | `drop-shadow(0 0 16px ...)` | `drop-shadow(0 0 5px ...)` | Jump animation | Low |
| `@keyframes fpcAttentionJumpPulse 100%` | `drop-shadow(0 0 13px ...)` | `drop-shadow(0 0 4px ...)` | Jump animation | Low |
| `.fpcQualityProblem ...` | `drop-shadow(0 0 8px ...)` | `drop-shadow(0 0 3px ...)` | Quality problem | Low |
| `.fpcElementSelected ...` | `drop-shadow(0 0 8px ...)` | **none** | Edit selection | **High** |
| `.djs-connection.fpcElementSelected ...` | `drop-shadow(0 0 8px ...)` | **none** | Edit selection | **High** |

## File: `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`

| Selector | Before | After | Trigger | Cost Impact |
|----------|--------|-------|---------|-------------|
| `.djs-context-pad .entry, .djs-popup .entry` | `box-shadow: 0 8px 26px ...` | `box-shadow: 0 2px 8px ...` | Context pad | Low |
| `.dark .djs-context-pad .entry, .dark .djs-popup .entry` | `box-shadow: 0 8px 24px ...` | `box-shadow: 0 2px 8px ...` | Context pad dark | Low |
| `.dark .djs-palette` | `box-shadow: 0 10px 28px ..., inset ...` | `box-shadow: 0 4px 10px ..., inset ...` | Palette dark | Low |
| `.light .djs-palette` | `box-shadow: 0 10px 24px ..., inset ...` | `box-shadow: 0 4px 10px ..., inset ...` | Palette light | Low |

## Summary
- **33 drop-shadow rules reduced or removed** in `05-02-bpmn-text-contrast.css`
- **10 drop-shadow rules reduced or removed** in `04-03-llm-bottlenecks.css`
- **4 box-shadow rules reduced** in `02-06-bpmn-dark-theme.css`
- Primary interaction paths (selection, hover) no longer trigger drop-shadow filters on most SVG elements
