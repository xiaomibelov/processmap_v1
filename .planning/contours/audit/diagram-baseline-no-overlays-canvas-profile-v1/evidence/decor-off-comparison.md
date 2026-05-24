# Decor-Off Comparison

## Context
- Property overlays were OFF for the entire session
- API loaded BPMN with `include_overlay=0`
- `.fpcPropertyOverlay` count remained 0 throughout
- "Слои ON ⚠ hidden" toggle did not respond in Playwright

## Previous Audit Baselines (for comparison)

From `audit/diagram-property-overlays-performance-gsd-v1`:
| State | Total DOM | .djs-overlay | .fpcPropertyOverlay |
|-------|-----------|--------------|---------------------|
| Overlays OFF | 8,025 | 17 | 0 |
| Overlays ON | 10,795 | 197 | 180 |
| Δ | +2,770 (+34.5%) | +180 | +180 |

From `perf/diagram-property-overlays-viewport-culling-v1`:
| State | Total DOM | .djs-overlay | .fpcPropertyOverlay |
|-------|-----------|--------------|---------------------|
| Overlays ON (default viewport) | 9,175 | 87 | 70 |
| Overlays ON (after culling) | 8,851 | 66 | 49 |
| Δ vs OFF | +1,150 (+14.3%) | +49 | +49 |

## Current Audit (overlays OFF)
| Metric | Value |
|--------|-------|
| Total DOM | 8,025 |
| .djs-overlay | 17 |
| .fpcPropertyOverlay | 0 |
| SVG nodes | 2,392 |

## Selection Inflation (overlays OFF)
| Metric | Before | After Selection | Δ |
|--------|--------|-----------------|---|
| Total DOM | 8,025 | 11,226 | +3,201 |
| SVG nodes | 2,392 | 5,578 | +3,186 |
| .djs-overlay | 17 | 17 | 0 |
| .fpcPropertyOverlay | 0 | 0 | 0 |

## Comparison

| Cost Source | Node Inflation | % of Total Inflation |
|-------------|---------------|---------------------|
| Property overlays ON (pre-culling) | +2,770 | — |
| Property overlays ON (post-culling) | +1,150 | — |
| Selection (overlays OFF, current) | +3,201 | 100% of selection cost |

**Critical finding**: The selection-induced DOM inflation (+3,201) is **larger** than the overlay-induced inflation (+1,150 after culling). Even with overlays completely off, selecting a single BPMN element adds more nodes than turning all property overlays on.

## Why overlays OFF doesn't help selection lag

1. **bpmn-js modeler handles**: In editor mode, selection always renders connection bendpoints, segment draggers, and selection outlines. These are bpmn-js native, not ProcessMap overlays.
2. **ProcessMap focus dimming**: `applySelectionFocusDecor` adds `fpcFocusDim` class to ~250 elements. This CSS change triggers style recalc across the entire SVG.
3. **Decor pipeline still fires**: `runSettledPropertiesFanout` calls `applyPropertiesOverlayDecor` even when overlays are off. While this exits early, it still schedules work.

## Verdict

Turning overlays OFF reduces baseline DOM by ~1,150 nodes, but it does **not** address the selection bottleneck (+3,201 nodes). The next fix contour should target selection behavior or the decor pipeline, not overlay visibility.
