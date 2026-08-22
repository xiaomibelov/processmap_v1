# Console Noise Audit

**Scope:** identify every repeated log source observed in the browser console, its trigger, frequency, and severity.

---

## Sources Table

| # | Marker | File | Line | Log Level | Gated? | Trigger | Frequency during active edit | Severity |
|---|--------|------|------|-----------|--------|---------|------------------------------|----------|
| 1 | `SNAPSHOT_TRY sid=... rev=... hash=... len=...` | `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js` | 325–328 | `console.debug` | ❌ no | Autosave / tab switch / beforeunload / lint autofix / manual save | Every autosave flush (~350–600 ms) | **High** (noise + string interpolation overhead) |
| 2 | `SNAPSHOT_DECISION sid=... existingCount=... reason=...` | `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js` | 331–365; `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js` | `console.debug` | ❌ no | Same as #1 | Every snapshot decision | **High** |
| 3 | `SNAPSHOT_PRUNE before=... after=...` | `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js` | 667–668 | `console.debug` | ❌ no | Snapshot save when record exceeds limit | Every save after cap reached | **Medium** |
| 4 | `SNAPSHOT_SAVED sid=... len=... backend=...` | `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js` | 699–702 | `console.debug` | ❌ no | Snapshot successfully persisted | Every snapshot save | **High** |
| 5 | `[FPC-OVERLAY-V2] extension overlays found Object` | `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js` | 365–367 | `console.log` | ❌ no | `mountFromBpmn()` on render / meta change | On diagram load and whenever `draft?.bpmn_meta` or `v2OverlaysEnabled` changes | **Medium** |
| 6 | `[FPC-OVERLAY-V2] overlays mounted` | `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js` | 438–441 | `console.log` | ❌ no | Same as #5 | Same as #5 | **Medium** |
| 7 | `[OverlayPanPatch] skipped X/Y _updateOverlaysVisibilty calls in last 5s` | `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js` | 24–47 | `console.debug` | ⚠️ only browser-level filter | Pan/zoom while overlay updates paused | At most every 5 s while panning | **Low-Medium** |
| 8 | `[LINT] run sid=... profile=... issues=... errors=... warns=...` | `frontend/src/components/ProcessStage.jsx` | 5523–5529 | `console.debug` | ❌ no | `qualitySummary` change (after lint recomputation) | Every autosave flush (~350 ms) | **Medium** |
| 9 | `[AUTOFIX] preview sid=... profile=... safe=... ops=...` | `frontend/src/components/ProcessStage.jsx` | 4957–4961 | `console.debug` | ❌ no | Autofix preview recomputation | When autofix panel open | **Low** |
| 10 | `Violation 'message' handler took <N>ms` (browser Long Task API) | `frontend/src/features/process/drawio/DrawioEditorModal.jsx` | 69–118 | browser warning | N/A | Draw.io iframe `message` events (`save`, `export`) | On draw.io save/export | **High** (when large diagrams) |

---

## Noise Intensity Estimate

For a 1-minute active editing session on a medium diagram:

- Snapshot markers (#1–#4): ~100–170 entries (at 350–600 ms cadence).
- Lint marker (#8): ~100–170 entries.
- Overlay V2 logs (#5–#6): 1–5 entries per (re)mount.
- Overlay pan patch (#7): up to 12 entries if panning continuously.
- Draw.io message violation (#10): 0–N depending on draw.io usage.

**Total:** roughly **200–350 debug/info log entries per minute** from the BPMN subsystem alone.

---

## Severity Reasoning

- **High:** unconditional logs that fire on the hot path (autosave, lint) and are visible in production builds. They bloat Sentry/telemetry log ingestion and make real errors harder to spot.
- **Medium:** mount-time logs or cap-hit logs that fire less often but still not guarded.
- **Low:** `console.debug` that most browsers hide by default but still executes string interpolation.

---

## Production-Build Consideration

None of the markers above are wrapped in `__FPC_DEBUG__`, `process.env.NODE_ENV === "development"`, or a runtime `localStorage` flag. In a Vite production build, `console.debug` calls remain in the bundle and execute at runtime. Recommendation: replace unguarded markers with a guarded logger or strip them in production via build-time transform.
