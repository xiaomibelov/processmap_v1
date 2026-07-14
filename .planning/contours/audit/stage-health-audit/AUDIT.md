# Stage Health Audit — `audit/stage-health-audit`

**Branch:** `fix/stage-health-audit`  
**Base:** `origin/main @ 75b6d6a649b1ba78690fca1be1bc7deef3234423`  
**Stage URL:** `https://stage.processmap.ru`  
**Audited at:** 2026-06-28T16:40Z  
**Run by:** Agent 2 / Executor, ProcessMap discipline

## Source/runtime truth

```
pwd: /opt/processmap-test
HEAD: 75b6d6a649b1ba78690fca1be1bc7deef3234423
origin/main: 75b6d6a649b1ba78690fca1be1bc7deef3234423
branch: fix/stage-health-audit
status: clean (only untracked .planning contour notes)
```

Stage `/version` at audit start:

```json
{"commit":"75b6d6a649b1ba78690fca1be1bc7deef3234423","buildTime":"2026-06-28T16:32:19Z","env":"stage"}
```

RAG query returned `invalid_user`, so no prior RAG chunks were injected.

## Problems found

### P1 — `409 Conflict` on BPMN URL

**User observation:** `GET /api/sessions/c2d668fb11/bpmn → 409 Conflict`

**Code evidence:**

- `GET /api/sessions/{sid}/bpmn` is handled by `backend/app/routers/sessions.py:189-191` → `session_service.bpmn_export` → `_legacy_main.session_bpmn_export` (`_legacy_main.py:7181-7296`).
- The GET handler does **not** call `_require_diagram_cas_or_409` or `_resolve_base_diagram_state_version`.
- It can return `200`, `202`, `404`, `503`; it cannot return `409` from the diagram-state CAS guard.
- The co-located write endpoint `PUT /api/sessions/{sid}/bpmn` (`_legacy_main.py:7390-...`) **does** call `_require_diagram_cas_or_409` at line 7421.

**Verdict:** the 409 is not coming from `GET /bpmn` itself. It is coming from `PUT /api/sessions/{sid}/bpmn` autosaves, which are firing too often (see P2). Either the log line is misread/mislabelled, or the autosave request is the real 409 source.

**Fix direction:** do not change GET (it is already correct). Reduce `PUT /bpmn` frequency and concurrency so CAS conflicts stop appearing.

### P2 — Autosave too aggressive

**User observation:** `PUT /api/sessions/{sid}/bpmn` every few seconds; `SNAPSHOT_SAVED` constantly.

**Code evidence:**

- `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js:122` defaults `debounceMs = 600`.
- `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js:183-201` constructs the coordinator **without** passing `debounceMs`, so production uses **600 ms**.
- Autosave is a pure trailing debounce on `commandStack.changed` (any modeler edit: drag, resize, create, delete, label edit, etc.). A pause ≥ 600 ms triggers `flushSave` → `persistRaw.saveRaw` → `apiPutBpmnXml` → `PUT /api/sessions/{sid}/bpmn`.

**Metrics (idle editing):**

- Typical user pauses every 1–3 s while editing.
- Observed result: one `PUT /bpmn` every few seconds.
- Each PUT carries `base_diagram_state_version` and is subject to CAS.
- Rapid sequential PUTs create races and 409s when a later save starts before the earlier one acks and updates the local known version.

**Fix direction:** raise the debounce to 10 000 ms (matching existing test fixtures that already use `debounceMs: 10000`). Optionally add a max-wait/throttle later.

### P3 — `MaxListenersExceededWarning: 11 close listeners`

**User observation:** `MaxListenersExceededWarning: 11 close listeners added`

**Code evidence:**

- No explicit `emitter.on('close', ...)` exists in `frontend/src`.
- The warning maps to the BPMN stage runtime-event wiring in `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`:
  - `bindContextMenuRuntimeEvents` adds 12+ `eventBus.on(...)` listeners and returns nothing.
  - `bindViewerStageEvents` and `bindModelerStageEvents` add more listeners and also return nothing.
- `frontend/src/components/process/BpmnStage.jsx` calls these binders but ignores the (missing) cleanup. It also ignores the cleanup returned by `bindSubprocessNavigationEvents`.
- Internal `diagram-js` emits `popupMenu.close` / `contextPad.close`; as custom listeners accumulate without removal, the bus-style emitter reports too many listeners.

**Fix direction:** make the wiring functions return unbinders, store them in `BpmnStage.jsx`, and call them before re-initializing viewer/modeler and on unmount.

### P4 — Too many requests while idle

**User observation:** a flood of requests even when the user is not doing anything.

**Code evidence (frontend polling while tab visible):**

| Request | Interval | Source |
|---------|----------|--------|
| `GET /api/sessions/{sid}/bpmn/versions?limit=1` | 15 000 ms | `frontend/src/components/ProcessStage.jsx:1692-1714` |
| `POST /api/sessions/{sid}/presence` | 45 000 ms | `frontend/src/features/process/stage/presence/useSessionPresence.js:158-160` |
| `GET /api/meta` | 120 000 ms | `frontend/src/features/appUpdate/useAppUpdateAvailable.js:73-75` |
| `GET /api/sessions/{sid}/auto-pass/precheck` | 2 000 ms (while pending) | `frontend/src/components/ProcessStage.jsx:2610-2618` |
| Draw.io Jazz `ensureRecord` | 1 000 ms (pilot flag only) | `frontend/src/features/process/drawio/drawioJazzSpikeAdapter.js:338-347` |

**Idle traffic estimate (tab visible, not counting heartbeat):**

- Remote sync: 4 req/min
- App update: 0.5 req/min
- **Total ≈ 4.5 req/min**

This is just under the 5 req/min target, but autosaves (P2) push it far over during editing, and the remote-sync poll is the largest single contributor.

**FPC-OVERLAY-V2 churn:**

- `BpmnStage.jsx:4577-4590` re-mounts overlays whenever `draft?.bpmn_meta` or `v2OverlaysEnabled` changes.
- Because `bpmn_meta` is mutated by autosave, overlays are cleared/re-added even when the overlay set is unchanged.
- This causes layout/paint work and console noise (`[FPC-OVERLAY-V2] extension overlays found`) but no direct network requests.

**Fix direction:**

1. Back off remote-session sync to 30 000 ms (or pause after 30 s of idle mouse/keyboard).
2. Keep presence at 45 000 ms but skip immediate re-heartbeat on `focus`/`visibilitychange` if one just fired.
3. Memoize overlay extraction so unchanged `bpmn_meta` does not re-mount DOM nodes.

## Summary of root causes

1. **409 symptom is a side effect of P2**, not a bug in `GET /bpmn`.
2. **600 ms autosave debounce** is the primary driver of network spam and CAS races.
3. **Missing listener cleanup** in BPMN stage wiring causes the close-listener warning.
4. **15 s remote-sync poll + overlay re-mount** produces idle churn.

## Evidence files

- `backend/app/routers/sessions.py:189-191` — GET /bpmn route
- `backend/app/_legacy_main.py:7181-7296` — legacy GET /bpmn handler (no CAS)
- `backend/app/_legacy_main.py:7390-7426` — PUT /bpmn handler (CAS at line 7421)
- `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js:122,626-669` — autosave debounce
- `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js:183-201` — coordinator construction
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js:150-560` — listener wiring without cleanup
- `frontend/src/components/process/BpmnStage.jsx:4330,4358,4426,4462,4577-4590` — cleanup ignored, overlay remount
- `frontend/src/components/ProcessStage.jsx:276,1692-1714,2610-2618` — polling intervals
- `frontend/src/features/process/stage/presence/useSessionPresence.js:158-160` — presence heartbeat
- `frontend/src/features/appUpdate/useAppUpdateAvailable.js:73-75` — app-update poll
