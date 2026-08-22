# Audit Summary: Console Noise, 409 Conflict, Snapshots & Overlay Performance

**Scope:** diagnostic only — no product code changes.  
**Contour:** `.planning/contours/audit/console-noise-409-snapshots-overlay/`  
**Branch audited:** `main` (HEAD `a3d60d45`)  
**Date:** 2026-06-25

---

## Key Findings

1. **409 Conflict never comes from `GET /api/sessions/{sid}/bpmn`.**  
   The GET handler has no CAS check. Observed 409s are almost certainly logged against `PUT /api/sessions/{sid}/bpmn` (save), `PATCH /bpmn_meta`, or node/edge mutations that share the same URL prefix in aggregated logs.

2. **409 is an optimistic-lock mismatch on `diagram_state_version`.**  
   The guard `_require_diagram_cas_or_409` raises 409 when the client’s `base_diagram_state_version` is stale or missing. Confirmed scenarios: two tabs editing the same session, snapshot auto-save finishing before an in-flight manual save.

3. **Subprocess XML upstream sync does NOT cause 409 — it bypasses parent CAS/lock.**  
   The new `re_embed_child_xml_into_parent` save path is best-effort and silent; it can overwrite concurrent parent edits instead of producing a clean conflict.

4. **Snapshot persistence is the noisiest production subsystem.**  
   `SNAPSHOT_TRY / DECISION / PRUNE / SAVED` are emitted via un-gated `console.debug` on every autosave (~350–600 ms during editing). Each record stores up to 20 full XML copies; localStorage fallback re-serializes the whole record every time.

5. **Overlay V2 logs are unconditional mount-time diagnostics.**  
   `[FPC-OVERLAY-V2]` fires on diagram render / meta change, not on pan/zoom. `[OverlayPanPatch]` is a pan/zoom `console.debug` at most every 5 s.

6. **Lint runs synchronously on the main thread every autosave flush.**  
   `runBpmnLint` / `buildBpmnLogicHints` execute inside a React `useMemo`; no Web Worker, no `requestIdleCallback`. The `mvp` profile filters results after all rules are computed, so selecting a lighter profile does not reduce work.

7. **Long `message` handler tasks are likely the draw.io iframe protocol.**  
   The only `window.addEventListener('message', ...)` handler in source is `DrawioEditorModal.jsx`; it synchronously parses large XML/SVG payloads and triggers the save chain.

---

## Proposed Fix Contours (priority order)

| Priority | Contour | Problem | Approximate Effort |
|----------|---------|---------|-------------------|
| **P1** | `fix/reduce-production-console-noise` | Un-gated snapshot/overlay/lint debug logs in production builds | Small (wrap with `__FPC_DEBUG__` or `localStorage` flag) |
| **P2** | `fix/409-conflict-ux-and-retry` | Two-tab / autosave collisions; stale base version; admin diagnostics not populated | Medium (better base-version sync, populated retry history, conflict replay) |
| **P3** | `fix/snapshot-performance` | Large synchronous localStorage/IDB writes, 20-item cap, no TTL | Medium (async IDB-only, chunked storage, TTL pruning) |
| **P4** | `fix/lint-offload-or-defer` | Main-thread lint blocks rendering on large diagrams | Medium-Large (Web Worker or `requestIdleCallback` + profile-aware early exit) |
| **P5** | `fix/subprocess-parent-sync-atomicity` | Parent sync bypasses lock/CAS — silent overwrite risk | Medium (acquire parent lock + parent CAS, or queue parent sync) |

---

## No Code Changes Made

This audit contains only findings, evidence, and recommendations. Implementation requires explicit approve per contour.
