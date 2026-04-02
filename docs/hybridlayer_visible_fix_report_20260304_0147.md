# Hybrid Layer Visibility Fix Report (2026-03-04)

## Snapshot
- branch: `feat/hybridlayer-fix-v1`
- head: `3801c2c`
- tags:
  - `cp/hybridlayer_visible_fix_start_20260304_013549`
  - `cp/hybridlayer_visible_fix_done_20260304_014646`

## Symptom Repro (fact)
- Layers popover showed `Hybrid (3)` for session `afbb609e19`.
- In Diagram with Hybrid ON users reported no visible markers.

## Data Checks (fact)
From `scripts/hybrid_visible_diag.sh` (SQLite + BPMN xml):
- session `afbb609e19` had 3 bindings:
  - `Activity_1k9t4a7: dx=-1648, dy=53`
  - `Collaboration_06ftemy: dx=0, dy=0`
  - `Lane_03dntrc: dx=0, dy=0`
- id match: `3/3` ids exist in current BPMN XML.

## Root Cause (fact)
1. Hybrid bindings existed and were valid by id.
2. Some saved offsets were large (`dx=-1648`) so computed marker positions were outside viewport.
3. UI had no direct recovery action (focus/go-to/cleanup) to bring markers back.

## Fixes Applied
1. `ProcessStage.jsx`
- Added render-safe hybrid rows (`hybridLayerRenderRows`) with viewport clamp.
- For missing center bindings, offsets are no longer applied to fallback position.
- Added Layers controls:
  - `Focus` (focus first valid marker and rebase offscreen offset to `dx=0,dy=0` for target)
  - per-item `Go to`
  - `Clean up missing bindings`
  - stats for bindings and viewport in/out counts
- Added dev debug mode `?debugHybrid=1`:
  - console log `[HYBRID_DEBUG] visibility`
  - debug cross marker for raw coordinates

2. `tailwind.css`
- Added styles for debug cross and layers item list rows.

3. `hybrid-layer-layers.spec.mjs`
- Added off-viewport scenario by patching one marker to `dx=-2200`.
- Added assertions for `Focus` and `Go to` actions.

4. Diagnostics script
- Added `scripts/hybrid_visible_diag.sh`.

## DOM/CSS Verification (fact)
Playwright runtime snapshot after fix:
- overlay exists: `true`
- computed style:
  - `display=block`
  - `visibility=visible`
  - `opacity=0.6`
  - `z-index=66`
  - `pointer-events=none`
- hotspot count: `3`

## Coordinate Sample (fact)
Viewport: `1164x538`

| elementId | node bbox (x,y,w,h) | marker (x,y) | inside viewport |
|---|---|---|---|
| Activity_1k9t4a7 | 95,55,110,90 | 151,101 | yes |
| Collaboration_06ftemy | 0,0,1164,538 | 1152,526 | yes |
| Lane_03dntrc | -305,-85,12030,630 | 1152,231 | yes |

## Artifacts
- `artifacts/hybrid_visible_fix_after.png`
- `artifacts/hybrid_visible_fix_edit.png`
