# WORKER_REPORT — fix/canvas-overlay-regression-emergency-v1

**Run ID**: `20260528T224900Z-21407`  
**Agent**: Agent 2 / Worker  
**Completed**: 2026-05-28T23:10:00Z  
**Status**: DONE

---

## What Was Done

Emergency revert of GPU-compositing / zoom-simplification regression that caused overlays to disappear during canvas pan.

### Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/styles/legacy/legacy_bpmn.css` | Revert to HEAD (remove GPU compositing + zoom simplification blocks) | −35 lines |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Remove GPU compositing hooks, keep overlay debounce | −63 lines (GPU code) |

### Preserved (stable debounce contour)

- `OVERLAY_PAN_DEBOUNCE_MS = 150`
- `debounce(fn, ms)` utility
- `bindOverlayPanDebouncer({ eventBus, inst })`
- `applyPropertiesOverlayDecorForZoomChangeDebounced`
- `deferUpdate: true` in `BpmnStage.jsx` and `bpmnWiring.js`

### Build & Deploy

- Frontend build: **PASS** (`npm run build`, 33.5s, 1014 modules)
- Gateway image rebuild: **PASS** (Dockerfile.prod rebuilt with fresh dist)
- Gateway container recreate: **PASS** (`docker compose up -d --no-deps --force-recreate gateway`)
- `:5177` serving fresh bundle: **PASS** (`Last-Modified: 2026-05-28T23:07:21Z`)

### Verification

CSS bundle on `:5177` confirmed clean:
- No `will-change` declarations
- No `.pan-active` class
- No `.zoom-simplified` / `.zoom-minimal` classes

---

## Git Proof

```
branch:   release/consolidation-pr-weekly-v1
HEAD:     dac5b98a revert(gpu-compositing): remove will-change/contain/zoom-simplification to fix overlay regression
status:   clean (frontend product files committed)
```

## Risks / Limitations

- Emergency fix prioritizes stability over pan performance.
- No custom overlays were present in the test diagram; verification relied on programmatic canvas API tests and visual label inspection.
- Pan performance may regress to pre-GPU-compositing levels (acceptable per PLAN).
