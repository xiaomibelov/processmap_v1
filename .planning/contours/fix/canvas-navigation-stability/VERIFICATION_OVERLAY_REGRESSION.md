# VERIFICATION: Overlay Regression Fix

**Branch:** `fix/canvas-navigation-stability`  
**Stand:** `http://clearvestnic.ru:5177`  
**Deploy:** `7adb8969` (2026-06-23 20:03:23 UTC)  
**Scope:** overlay detachment + pan/zoom lag caused by Option C jitter patch

---

## What was changed

1. `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js`
   - Removed `Overlays._updateRoot` from the pause toggle.
   - Kept pause only for `_updateOverlaysVisibilty`, `show`, `hide` (the expensive/flickering paths).
2. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
   - Added `overlays._updateRoot(overlays._canvas.viewbox())` inside `restoreUpdates` as a safety net after unpausing.

---

## Verification results

### 1. Build & deploy

```
[DEPLOY] BUILD_ID=7adb8969 branch=fix/canvas-navigation-stability env=prod
[DEPLOY] Healthcheck passed (http://localhost:8011/version)
```

Build succeeded with no new warnings.

### 2. Subprocess drilldown / return (overlay detachment)

| Step | Screenshot | Status |
|---|---|---|
| Root diagram | `overlay_fix_root.png` | Overlays (small icons near tasks/elements) are attached |
| Child subprocess | `overlay_fix_child.png` | Breadcrumb `dadad > Подпроцесс: Activity_0dy2zps`, overlays attached |
| After return | `overlay_fix_after_return.png` | Viewport restored to original root, overlays still attached |
| Before fix (reference) | `overlay_bug_before_fix.png` | Same return step — viewport offset, elements shifted right, overlay drift visible |

Comparison: the pre-fix screenshot shows the canvas shifted far to the right after return, leaving most of the viewport empty and overlay positions stale. The post-fix screenshot shows the original root viewport fully restored and overlay icons aligned with their elements.

### 3. Pan / zoom performance

Run with `?profilePan=1` via `/root/ui_verify/pan_profile.js`:

```json
{
  "framesTotal": 568,
  "longTasks": 31,
  "panEvents": 106,
  "funcTimes": {
    "Overlays._updateOverlaysVisibilty": { "count": 11, "total": 1.60, "max": 0.30 },
    "BpmnStage.getCanvasSnapshot":       { "count": 53, "total": 39.0, "max": 10.6 },
    "Overlays._updateRoot":              { "count": 61, "total": 3.60, "max": 1.20 },
    "BpmnStage.emitViewboxChanged":      { "count": 24, "total": 0.20, "max": 0.10 }
  }
}
```

- `_updateRoot` now fires during pan/zoom (61 calls, ~3.6 ms total) — cheap O(1) root transform, no forced reflow.
- `_updateOverlaysVisibilty` is still throttled (11 calls vs 106 pan events) — expensive O(n) pass remains batched.
- Pan interaction completed without overlay freeze/offset; no visible lag in the automated gesture.

### 4. Console / page errors

No overlay-related `PAGEERROR` or console error observed during the verification run.

---

## Conclusion

- Overlay detachment regression is fixed.
- Pan/zoom lag is mitigated: cheap root transform runs per-frame, expensive visibility pass stays throttled.
- PR #399 is now stable for overlay behavior.

**No merge to `main` without explicit user approve.**
