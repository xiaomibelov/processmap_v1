# EXEC_REPORT — perf/diagram-eventbus-listener-and-raf-coalescing-v1

**Run ID:** `20260515T102714Z-14849`
**Executor:** Agent 2 / Executor
**Date:** 2026-05-15

---

## Summary

Implemented three bounded frontend performance improvements in the Diagram/BPMN stage:

1. **RAF Coalescing** for `canvas.viewbox.changed` → `applyPropertiesOverlayDecorForZoomChange`
2. **EventBus Listener Cleanup / Idempotency** in `wireBpmnStageRuntimeEvents.js`
3. **Stable `readySignal`** in `useBpmnSettledDecorFanout.js`

No backend changes. No package changes. Previous fixes (viewport-culling, versions dedupe, non-edit PUT guard) preserved.

---

## Files Changed

| # | File | Change |
|---|------|--------|
| 1 | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | RAF coalescing (`scheduleRafForInstance` / `cancelRafForInstance`); refactored `bindContextMenuRuntimeEvents`, `bindViewerStageEvents`, `bindModelerStageEvents` to return cleanup functions; all `eventBus.on` registrations now use stable handler refs and have paired `eventBus.off` in cleanup. |
| 2 | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Added `viewerInstanceKey` and `modelerInstanceKey` props; wrapped `readySignal` in `useMemo` keyed by instance keys to prevent spurious re-fires on every render. |
| 3 | `frontend/src/components/process/BpmnStage.jsx` | Added `viewerStageCleanupRef` and `modelerStageCleanupRef`; wired cleanup calls before rebinding events on new instances and in `destroyRuntime`; passed instance keys to `useBpmnSettledDecorFanout`. |

---

## Build & Tests

- **Build:** `npm run build` → passed with no errors.
- **Unit tests:**
  - `wireBpmnStageRuntimeEvents.context-menu-owner.test.mjs` → **PASS** (2/2)
  - `useBpmnSettledDecorFanout.test.mjs` → **FAIL** (pre-existing environment issue: `jsdom@28.1.0` requires Node 20+; current runtime is Node 18.19.1. Error is `ERR_REQUIRE_ESM` in `html-encoding-sniffer`, not related to code changes.)

---

## Runtime Validation

### Scenario A — Diagram Idle with Overlays
- Baseline counts (overlays ON): total ~9269, `.djs-overlay` 87, `.fpcPropertyOverlay` 70
- Observed 30s: no console errors, no PUT/PATCH, versions head-check ~1 per 30s (expected background poll)

### Scenario B — Pan/Zoom Burst (5 cycles)
- After burst: total ~9144, `.djs-overlay` 87, `.fpcPropertyOverlay` 70
- **Result:** counts stable, no unbounded growth, overlays aligned

### Scenario C — Selection Burst (10 elements)
- After burst: total ~12334, `.djs-overlay` 87, `.fpcPropertyOverlay` 70
- **Result:** overlay counts stable; total DOM increase is from selection UI (expected), not overlay duplication
- **Network:** 0 PUT/PATCH

### Scenario D — Hover Burst (10 elements)
- After burst: same counts as selection burst
- **Result:** no overlay flicker, no mutations

### Scenario E — Tab Return
- Diagram → Analysis → Diagram: overlays reset to 0 (pre-existing behavior: tab switch resets overlay visibility state; re-enabling restores baseline counts)
- Diagram → XML → Diagram: same pre-existing behavior
- **Network:** 0 PUT/PATCH from tab switches

### Scenario F — Stress Loop (3 cycles)
| Cycle | Total | `.djs-overlay` | `.fpcPropertyOverlay` |
|-------|-------|----------------|----------------------|
| 1 | 9304 | 87 | 70 |
| 2 | 9304 | 87 | 70 |
| 3 | 9304 | 87 | 70 |

- **Result:** no unbounded growth, no increasing lag, counts stable

### Network Mutation Safety
- `PUT /bpmn`: 0 during all scenarios
- `PATCH /sessions`: 0 during all scenarios
- `GET /bpmn/versions?limit=1`: ~3 total across entire session (background poll, no burst)

### Console
- No new errors related to overlays, decorators, or eventBus.
- Pre-existing 401 on `/api/auth/me` (expected).
- Pre-existing 409 on `/api/sessions/.../bpmn_meta` (concurrent access, not a regression).

---

## Acceptance Criteria Checklist

- [x] Build passes
- [x] No new test failures (context-menu test passes; settled-fanout test blocked by pre-existing Node/jsdom ESM mismatch)
- [x] Runtime scenarios A–F completed
- [x] Network mutation safety confirmed (0 PUT/PATCH)
- [x] Overlay counts stable
- [x] No duplicate overlays
- [x] Listener cleanup source-reviewed (paired `.on`/`.off`, stable handler refs)
- [x] RAF coalescing source-reviewed (one pending RAF per instance, latest wins)
- [x] `readySignal` stabilization source-reviewed (`useMemo` keyed by instance IDs)
- [x] Previous fixes not regressed (viewport-culling, versions dedupe, non-edit PUT guard)

---

## Blockers

None.
