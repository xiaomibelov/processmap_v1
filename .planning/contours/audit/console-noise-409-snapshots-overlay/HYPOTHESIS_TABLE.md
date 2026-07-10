# Hypothesis Table

| ID | Area | Hypothesis | Status | Evidence |
|----|------|------------|--------|----------|
| **409-H1** | 409 Conflict | Snapshot auto-save collides with manual save → 409 | **Confirmed** | Both use `session_bpmn_save` with same CAS; Redis lock prevents overlap during save, but stale base version after release causes 409 (`_legacy_main.py:7389–7613`, `persistRetryMachine.js`). |
| **409-H2** | 409 Conflict | Subprocess XML upstream sync causes 409 on parent | **Refuted** | Parent sync bypasses parent lock and CAS (`_legacy_main.py:7542–7583`); it silently overwrites instead of raising 409. |
| **409-H3** | 409 Conflict | Two tabs with same session → concurrent save 409 | **Confirmed** | `_require_diagram_cas_or_409` compares client base to server current; frontend has `same_user_other_tab` classification (`saveConflictModalModel.js:90`). |
| **409-H4** | 409 Conflict | 409 on GET is session-state mismatch / lock | **Refuted for GET** | `GET /api/sessions/{sid}/bpmn` has no CAS; observed 409s are likely from PUT/PATCH sharing the URL prefix. |
| **SNAP-H1** | Snapshots | Snapshot saves too frequently | **Confirmed** | Autosave cadence is 350–600 ms, not 5–10 s. |
| **SNAP-H2** | Snapshots | Pruning blocks main thread | **Partially refuted** | Pruning (`slice()`) is cheap; synchronous `JSON.stringify` + `localStorage.setItem` can block. |
| **SNAP-H3** | Snapshots | 210 KB × 20 = 4.2 MB bloats storage | **Confirmed** | Record stores up to 20 full XML copies; localStorage fallback re-serializes entire record. |
| **SNAP-H4** | Snapshots | IndexedDB write conflicts with other async ops | **Unconfirmed** | No transaction-conflict evidence found; localStorage writes are the bigger concern. |
| **OVER-H1** | Overlays | Overlay logs enabled in production build | **Confirmed** | `[FPC-OVERLAY-V2]` uses unconditional `console.log`; no `__FPC_DEBUG__` or env guard. |
| **OVER-H2** | Overlays | `_updateOverlaysVisibilty` called on every mousemove | **Refuted** | Called on `canvas.viewbox.changed`; skipped during pan via `patchOverlayPanPerf`. |
| **OVER-H3** | Overlays | Overlay nodes recreated on every update | **Partially refuted** | Recreated on mount/meta change; reused during pan/zoom. |
| **OVER-H4** | Overlays | Throttle 5 s is too rare but log spam remains | **Refuted** | `[OverlayPanPatch]` log fires at most every 5 s; the real spam is unconditional mount-time logs. |
| **LINT-H1** | Lint | Lint blocks the main UI thread | **Confirmed** | `runBpmnLint` / `buildBpmnLogicHints` run synchronously inside React `useMemo`; no Worker. |
| **LINT-H2** | Lint | Lint recomputes on every change with little throttling | **Partially confirmed** | Not every keystroke, but every trailing-edge autosave (~350 ms). |
| **LINT-H3** | Lint | `mvp`/`production` profile selection does not reduce work | **Confirmed** | All rules computed before `shouldKeepRule` filtering; autofix preview also always reparses XML. |
| **MSG-H1** | Message handler | Snapshot save callback in `postMessage` | **Refuted** | Snapshots are driven by autosave coordinator, not a message handler. |
| **MSG-H2** | Message handler | Overlay update via message channel | **Refuted** | No MessageChannel usage in source. |
| **MSG-H3** | Message handler | Browser extension intercepts messages | **Possible, unverified** | Extensions can add listeners; not visible in source. |
| **MSG-H4** | Message handler | Draw.io iframe handler processes large payloads synchronously | **Confirmed** | Only `window.addEventListener('message')` handler in source; parses large XML/SVG and triggers save chain. |

---

## Cross-Cutting Themes

1. **Unguarded `console.debug`/`console.log` in production** is the dominant source of console noise (snapshot, overlay V2, lint).
2. **Synchronous main-thread work** is the dominant performance risk (lint, snapshot localStorage fallback, draw.io message handler).
3. **409 is a symptom of multi-tab / autosave concurrency**, not a backend bug in the GET handler.
4. **Subprocess parent sync has a silent-overwrite data-loss risk** that is separate from 409 noise and arguably higher severity.
