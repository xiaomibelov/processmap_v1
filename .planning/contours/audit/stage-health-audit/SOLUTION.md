# Solution Plan — Stage Health Audit

## Checkpoint policy

After each numbered fix:
1. Apply the minimal code change.
2. Run the relevant test/build command.
3. Write a short checkpoint note in this contour directory.
4. Stop for user approval before deploy.

## F1 — Fix autosave debounce (root cause of 409 spam)

**File:** `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js`

**Change:** pass `debounceMs: 10_000` when creating the coordinator.

**Why:** production currently uses the hard-coded default 600 ms. Existing test fixtures already use 10 000 ms, so this aligns production with the intended value.

**Checkpoint test:**

```bash
cd /opt/processmap-test/frontend
npm run test -- --run createBpmnCoordinator
npm run build
```

**Expected:** tests pass, build succeeds, no more than one `PUT /bpmn` per 10 s during normal editing.

## F2 — Clean up BPMN stage runtime listeners

**Files:**
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- `frontend/src/components/process/BpmnStage.jsx`

**Change:**
1. Make `bindContextMenuRuntimeEvents`, `bindViewerStageEvents`, and `bindModelerStageEvents` return cleanup functions that remove every `eventBus.on(...)` and native listener they added.
2. In `BpmnStage.jsx`, store the returned unbinders in refs and call them before re-initializing viewer/modeler and in the destroy/unmount cleanup.
3. Also consume and cleanup the unbinder from `bindSubprocessNavigationEvents`.

**Why:** stops listener accumulation on every viewer/modeler re-init, which is the source of the `MaxListenersExceededWarning`.

**Checkpoint test:**

```bash
cd /opt/processmap-test/frontend
npm run test -- --run wireBpmnStageRuntimeEvents
npm run build
```

**Expected:** tests pass, build succeeds, warning gone in browser console.

## F3 — Reduce idle remote-sync polling

**File:** `frontend/src/components/ProcessStage.jsx`

**Change:** increase `REMOTE_SESSION_SYNC_POLL_MS` from 15 000 ms to 30 000 ms.

**Why:** cuts the largest idle request source in half while keeping remote-save highlights reasonably fresh. Hidden-tab skipping already exists.

**Checkpoint test:**

```bash
cd /opt/processmap-test/frontend
npm run build
```

**Expected:** build succeeds; idle visible-tab traffic drops below 5 req/min (excluding heartbeat).

## F4 — Memoize FPC-OVERLAY-V2 re-mounts

**File:** `frontend/src/components/process/BpmnStage.jsx`

**Change:** compare the extracted overlay list structurally (or memoize via `useMemo` / deep-equal) before calling `overlayLifecycle.mountFromBpmn`. Avoid clearing/re-adding DOM nodes when `bpmn_meta` mutated but overlay set is unchanged.

**Why:** reduces layout/paint churn and console noise caused by autosave updating `bpmn_meta`.

**Checkpoint test:**

```bash
cd /opt/processmap-test/frontend
npm run build
```

**Expected:** build succeeds, overlay console noise reduced during idle editing.

## Verification matrix

| Criterion | How to verify |
|-----------|---------------|
| `GET /bpmn` returns 200, not 409 | Confirm GET handler has no CAS (already true); verify stage logs show no 409s on `GET /bpmn`. |
| Autosave ≤ 1 per 10 s | Browser devtools Network tab: `PUT /bpmn` gaps ≥ 10 s during normal editing. |
| EventEmitter warning gone | Browser console / stage logs: no `MaxListenersExceededWarning`. |
| Idle < 5 req/min (excl. heartbeat) | Browser devtools: count non-presence requests during 2 min idle. |
| `npm run build` OK | Run build in `frontend/`. |
| Frontend tests OK | Run targeted tests for changed modules. |
| Backend tests OK | Run `pytest` in `backend/` (no backend changes for this contour, but regression check). |

## Open decisions

1. Should F1 use a pure 10 s debounce, or a 1 s debounce + 10 s max-wait throttle?  
   **Recommendation:** start with 10 s debounce (simplest, matches tests). If UX feels laggy, add max-wait later.

2. Should F3 pause polling entirely after mouse/keyboard idle > 30 s?  
   **Recommendation:** start with 30 s interval; full pause can be a follow-up if needed.

3. Should F2 also set `setMaxListeners(20)` as a defensive fallback?  
   **Recommendation:** not needed if cleanup is implemented; if the warning persists, add it then.

## Rollback

- All changes are frontend-only and can be reverted with `git revert <fix-commit>`.
- No DB migrations or env changes are involved.
