# Recommendations

Prioritized by impact and effort. These are proposed fix-contours; no code changes are made in this audit.

---

## P1 — Reduce Production Console Noise (highest ROI)

**Problem:** Snapshot, overlay V2, and lint logs are emitted unconditionally via `console.debug`/`console.log` in production builds.

**Evidence:**
- `SNAPSHOT_TRY / DECISION / PRUNE / SAVED` — un-gated (`createBpmnPersistence.js:325`, `bpmnSnapshots.js:699`).
- `[FPC-OVERLAY-V2] ...` — un-gated `console.log` (`overlayLifecycleManager.js:365,438`).
- `[LINT] run ...` — un-gated `console.debug` (`ProcessStage.jsx:5523`).

**Recommended actions:**
1. Introduce a guarded logger utility (e.g., `logDebug(category, ...)` that checks `localStorage.fpc_debug_<category>` or a build-time `__FPC_DEBUG__` flag).
2. Replace all markers above with guarded calls.
3. For production builds, configure Vite to strip `console.debug` and `console.log` entirely (e.g., `esbuild.drop: ['console', 'debugger']` or a custom plugin).
4. Keep `[OverlayPanPatch]` skip log behind `fpc_debug_overlay` flag.

**Expected outcome:** 200–350 fewer log entries per minute of active editing; smaller telemetry/log ingestion; easier incident debugging.

**Contour:** `fix/reduce-production-console-noise`  
**Effort:** Small  
**Risk:** Very low

---

## P2 — Improve 409 Conflict UX and Diagnostics

**Problem:** Users see 409 when two tabs or autosave+manual-save collide. Admin diagnostics panels are unpopulated.

**Evidence:**
- `_require_diagram_cas_or_409` raises 409 on stale `base_diagram_state_version`.
- Frontend auto-retries 409/423 with fixed delays (300/800/1200 ms) up to 2 times.
- `saveConflictModalModel.js` already handles `same_user_other_tab`.
- Admin diagnostics fields `save_retry_history` / `lock_busy_history` are exposed but never written.

**Recommended actions:**
1. Populate `bpmn_meta.diagnostics.save_retry_history` and `lock_busy_history` from the coordinator / persist retry machine.
2. Ensure the active tab fetches the latest `diagram_state_version` before retrying (e.g., after 409, call `/meta` and replay with new base).
3. Consider a short client-side lock/token so the same browser does not autosave and manually save the same session simultaneously.
4. Improve user message to distinguish “another tab” vs “another user”.

**Expected outcome:** Fewer user-visible conflicts; actionable admin diagnostics.

**Contour:** `fix/409-conflict-ux-and-retry`  
**Effort:** Medium  
**Risk:** Low

---

## P3 — Improve Snapshot Performance

**Problem:** Snapshot persistence serializes large records synchronously and stores up to 20 full XML copies per session.

**Evidence:**
- `SNAPSHOT_DEFAULT_LIMIT = 20` (`bpmnSnapshots.js:25`).
- `writeRecordToLocalStorage` calls `JSON.stringify(record)` (`bpmnSnapshots.js:244`).
- Each item stores full XML (`len=210144` observed).
- No TTL; no chunking.

**Recommended actions:**
1. Prefer IndexedDB and drop the localStorage fallback for large records, or store only metadata in localStorage.
2. Chunk large XML into smaller IDB records instead of one giant record.
3. Add a TTL (e.g., 7 days) and prune by age in addition to count.
4. Move snapshot serialization off the main thread (IDB is already async; avoid `localStorage.setItem`).
5. Add `performance.now()` timing around snapshot write paths to measure impact.

**Expected outcome:** Reduced main-thread jank, lower storage bloat.

**Contour:** `fix/snapshot-performance`  
**Effort:** Medium  
**Risk:** Medium (storage schema migration)

---

## P4 — Offload or Defer Lint

**Problem:** Lint runs synchronously on the main thread every autosave flush and computes all rules even for `mvp`.

**Evidence:**
- `useQualityDerivation` uses `useMemo` with `draft.bpmn_xml/interview/nodes`.
- `buildBpmnLogicHints` parses XML and traverses the full graph synchronously.
- No Web Worker, no `requestIdleCallback`.

**Recommended actions:**
1. Add profile-aware early exit: skip expensive rules (cycles, duplicate names, interview mismatch) when profile is `mvp`.
2. Cache parsed DOM / element index across lint runs if XML hash unchanged.
3. Run lint in a Web Worker, or at minimum defer via `requestIdleCallback` and show a stale/loading indicator.
4. Skip lint when the quality panel is closed (or compute only on demand).

**Expected outcome:** Smoother UI during active editing, especially for large diagrams.

**Contour:** `fix/lint-offload-or-defer`  
**Effort:** Medium–Large  
**Risk:** Medium

---

## P5 — Make Subprocess Parent Sync Atomic

**Problem:** Child save re-embeds XML into parent and saves parent without lock or CAS, risking silent overwrite.

**Evidence:**
- `session_bpmn_save` child branch calls `st.save(parent)` directly (`_legacy_main.py:7542–7583`).
- No `_require_diagram_cas_or_409` on parent.
- No Redis lock on parent.

**Recommended actions:**
1. Acquire the parent Redis lock before parent sync.
2. Apply `_require_diagram_cas_or_409` to the parent using the parent’s `diagram_state_version` known to the child (or re-fetch parent version).
3. If parent conflict, queue the parent sync for later replay instead of silently skipping.

**Expected outcome:** Eliminates silent parent overwrite; converts race into a clean 409/retry.

**Contour:** `fix/subprocess-parent-sync-atomicity`  
**Effort:** Medium  
**Risk:** Medium

---

## P6 — Instrument Heavy Paths

**Problem:** Several suspected performance issues have no measured duration data.

**Recommended actions:**
1. Add guarded `performance.now()` spans around:
   - `runBpmnLint` / `buildBpmnLogicHints`
   - snapshot `writeRecord` (IDB + localStorage)
   - draw.io `message` handler
   - `_updateOverlaysVisibilty` during pan
2. Report slow spans to telemetry only when threshold exceeded, to avoid adding noise.

**Expected outcome:** Data-driven prioritization of future performance work.

**Contour:** `fix/perf-instrumentation`  
**Effort:** Small  
**Risk:** Very low
