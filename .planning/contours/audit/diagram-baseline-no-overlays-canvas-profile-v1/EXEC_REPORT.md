# EXEC_REPORT — audit/diagram-baseline-no-overlays-canvas-profile-v1

**Run ID**: `20260515T112356Z-18129`  
**Executor**: Agent 2 / Executor  
**Date**: 2026-05-15  
**Contour**: `audit/diagram-baseline-no-overlays-canvas-profile-v1`

---

## Summary

This contour profiles the ProcessMap Diagram/BPMN canvas baseline performance **with property overlays visually OFF** (` .fpcPropertyOverlay` count = 0). After five previous performance-fix contours, the canvas still feels subjectively slow. This audit identifies the true bottleneck.

**Primary finding**: Element selection triggers a massive SVG/DOM inflation (+3,198 nodes, +3,186 SVG nodes, ~+40% total DOM) even when property overlays are completely off. This inflation is driven by bpmn-js modeler editor-mode rendering (connection bendpoints, selection handles, context pads) combined with ProcessMap's `fpcFocusDim` focus-dimming logic that iterates over **all** selectable elements.

**Secondary finding**: The decor pipeline (`runSettledPropertiesFanout` → `applyPropertiesOverlayDecor`) is still invoked even when overlays are off. It exits early, but the function call and ref reads still execute on every `readySignal` or `view` change.

**No network mutations** were observed from pan, zoom, selection, hover, or tab switch.

---

## What Was Done

1. **Pre-flight**: Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, and all 5 previous contour REVIEW_REPORTs.
2. **Runtime truth capture**: Git status, branch (`fix/lockfile-sync-test`), HEAD (`a9a9d9c5f468d9da63415306da6d34dcd605aa0d`), runtime health (API 200, frontend 200).
3. **Browser profiling** (Playwright against `http://clearvestnic.ru:5180`, session `wewe` / `4c515d1c6e`):
   - Mode 1 — Normal Diagram (overlays OFF by server parameter `include_overlay=0`)
   - Mode 2 — Overlays OFF (already in this state; toggle unresponsive in Playwright, documented)
   - Mode 3 — Decor pipeline isolation (source-level evidence only)
   - Mode 4 — Pure bpmn-js baseline (same as Mode 1 since overlays are off)
   - Scenarios A–H executed where feasible
4. **Source map analysis**: Read all 12 candidate files from PLAN.md Section 8.
5. **Deliverables created**: All reports, evidence directory, hypothesis ranking, next contour recommendation.

---

## Key Metrics

| Metric | Baseline (no selection) | After Selection | Δ |
|--------|------------------------|-----------------|---|
| Total DOM nodes | 8,025 | 11,226 | +3,201 (+40%) |
| SVG nodes | 2,392 | 5,578 | +3,186 (+133%) |
| `.djs-overlay` | 17 | 17 | 0 |
| `.fpcPropertyOverlay` | 0 | 0 | 0 |
| `[data-element-id]` | 276 | 276 | 0 |
| `.djs-bendpoint` | 0 | 916 | +916 |
| `.fpcFocusDim` | 0 | ~907 | +907 |
| `PUT /bpmn` | 0 | 0 | 0 |
| `PATCH /sessions` | 0 | 0 | 0 |

**Tab switch cleanup**: After Diagram → Analysis → Diagram, counts return to ~7,994 total / ~2,383 SVG.

**Pan/zoom**: No DOM change.

**Hover**: No DOM change.

---

## Limitations

1. **Overlay toggle unresponsive in Playwright**: The "Слои ON ⚠ hidden" button did not respond to synthetic clicks. Actual `.fpcPropertyOverlay` count remained 0 throughout. Cannot compare overlays ON vs OFF in the same session.
2. **Chrome performance trace**: Not captured; Playwright trace API not used in this session.
3. **Single session**: Only session `wewe` (~276 BPMN elements) was profiled.

---

## Evidence Files

- `evidence/counts-before-after.md`
- `evidence/network-summary.md`
- `evidence/console-summary.md`
- `evidence/interaction-timings.md`
- `evidence/decor-off-comparison.md`

---

## No Product Code Changed

- `git diff --name-only` within `.planning/` scope shows only expected audit artifacts.
- No frontend/backend source files modified by this contour.
- No commits, pushes, PRs, or deployments performed.
