# Unified Save Coordinator (P0-2) Design

## Goal
Replace the fragmented frontend save paths (BPMN XML, session meta, interview analysis, drawio BPMN-meta visibility patch) with a single `saveCoordinator` that provides per-session sequential execution, debounce, retry with exponential backoff, CAS version tracking via `casVersionTracker`, and global status events.

## Background
P0-1 introduced `frontend/src/lib/casVersionTracker.js` as the single in-memory CAS base-diagram-state-version store. Several modules still implement their own queues, retry loops, and conflict handling:

- `saveBpmnState.js` — PUT `/api/sessions/:id/bpmn`, custom 3-attempt retry, conflict/lock detection, snapshotting, session sync.
- `createBpmnPersistence.js` — same XML endpoint, runtime cache, snapshotting.
- `interviewAnalysisPatchHelper.js` — PATCH `/api/sessions/:id` with `interview.analysis`, delegated to `sessionPatchCasCoordinator`.
- `sessionPatchCasCoordinator.js` — PATCH `/api/sessions/:id` generic queue.
- `useSessionMetaWriteGateway.js` — PATCH `/api/sessions/:id` with `bpmn_meta`, also via `sessionPatchCasCoordinator`.
- `useSessionMetaPersist.js` — PATCH `/api/sessions/:id/bpmn-meta` for drawio visibility toggle (direct call, currently outside coordinator; out of scope for first pass, tracked as remaining).

## Save pipelines inventory

| Save pipeline | Endpoint | Method | Payload | CAS? | 409 handler | Error handler | UX | Callers |
|---|---|---|---|---|---|---|---|---|
| BPMN XML durable | `/api/sessions/:id/bpmn` | `PUT` | `{ xml, rev?, base_diagram_state_version, source_action?, bpmn_meta?, import_note? }` | yes (`base_diagram_state_version`) | rollback tracker; extract server version; call `onConflict` | 3 retries, 500ms lock retry, toast via `shortErr`/caller | `saveBpmnState` | `App.jsx`, `BpmnStage.jsx`, `ProcessStage.jsx`, property autosave via `createBpmnCoordinator` |
| BPMN XML raw / autosave | `/api/sessions/:id/bpmn` | `PUT` | same as above | yes | rollback tracker; extract server version | surface `errorCode` + localized text | `createBpmnPersistence.saveRaw` | `bpmnWiring.js` (`flushSave`), tests |
| Session meta (BPMN meta) | `/api/sessions/:id` | `PATCH` | `{ bpmn_meta: ..., base_diagram_state_version? }` | yes when base known | rollback tracker; extract server version from `errorDetails` | `setGenErr`/caller toast | `useSessionMetaWriteGateway` / `sessionPatchCasCoordinator` | `App.jsx` (`persistSessionMetaBoundary`), `BpmnStage.jsx`, `ProcessStage.jsx` |
| Interview analysis | `/api/sessions/:id` | `PATCH` | `{ interview: { analysis: ... }, base_diagram_state_version? }` | yes when base known | rollback tracker; extract server version | caller/inline toast | `interviewAnalysisPatchHelper` | `useInterviewSyncLifecycle`, analysis UI |
| Drawio BPMN-meta visibility | `/api/sessions/:id/bpmn-meta` | `PATCH` | `{ drawio: ..., base_diagram_state_version? }` | optional | not implemented today | caller handles | `useSessionMetaPersist` | `ElementSettingsControls.jsx` drawio toggle |

Backend endpoints that return the new `diagram_state_version`:
- `PUT /api/sessions/:id/bpmn` returns `diagram_state_version` (and `version` as stored BPMN rev).
- `PATCH /api/sessions/:id` returns the updated session object, which includes `diagram_state_version`.
- `PATCH /api/sessions/:id/bpmn-meta` currently returns only the updated `bpmn_meta`; the backend may also include `diagram_state_version` but the frontend does not rely on it today.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    saveCoordinator (singleton)              │
│  registerPipeline(name, config)                             │
│  execute(name, payload)                                     │
│  executeBatch(names, payloadMap)                            │
│  getStatus(name) / getGlobalStatus()                        │
│  subscribe(callback) / unsubscribe(callback)                │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  ┌──────────┐         ┌──────────┐          ┌──────────┐
  │  bpmnXml │         │   meta   │          │ analysis │
  │ pipeline │         │ pipeline │          │ pipeline │
  └────┬─────┘         └────┬─────┘          └────┬─────┘
       │                    │                     │
       ▼                    ▼                     ▼
 PUT /sessions/:id/bpmn  PATCH /sessions/:id  PATCH /sessions/:id
```

### Queue and concurrency
- One global queue per `sessionId`. All pipelines for the same session run sequentially.
- A pipeline invocation that arrives while another save for the same session is running is queued behind it.
- Debounce is applied per (pipeline name, sessionId) using a leading/trailing timer: rapid calls replace the pending payload and only the last one executes after `debounceMs`.
- Retry with exponential backoff: `retryDelayMs * 2^attempt` (1s, 2s, 4s by default) up to `retryCount`.
- 409 conflict: stop retrying, call pipeline `on409`, emit global `conflict` event, return the conflict result to the caller.

### CAS version tracking
- `getBaseVersion(sessionId)` is called just before the request is sent.
- `onSuccess(response, sessionId)` calls `casVersionTracker.bumpVersion` with the new `diagram_state_version`.
- `on409(response, sessionId)` calls `casVersionTracker.rollbackVersion` and optionally `setVersion` with the server's current version if the response exposes it.

### Pipeline config
```js
{
  endpoint,            // (sessionId, payload) => string
  method,              // "PUT" | "PATCH" | ...
  buildPayload,        // (payload, sessionId) => request body
  getBaseVersion,      // optional (sessionId) => number
  onSuccess,           // (response, sessionId) => void
  on409,               // (response, sessionId) => void
  onError,             // (error, sessionId) => void
  debounceMs: 300,
  retryCount: 3,
  retryDelayMs: 1000,
}
```

### Public API
- `registerPipeline(name, config)`
- `execute(name, payload)` — returns `Promise<result>`
- `executeBatch(names, payloadMap)` — runs named pipelines sequentially for the same session, returns array of results
- `getStatus(name)` / `getGlobalStatus()`
- `subscribe(callback)` / `unsubscribe(callback)` — events: `status`, `success`, `error`, `conflict`
- `hasUnsavedChanges()` — optional, based on pending queue/debounce state

## Migration scope

| Pipeline name | Old module | New call | Notes |
|---|---|---|---|
| `bpmnXml` | `saveBpmnState.js` direct `apiPutBpmnXml` / `flushSave` | `saveCoordinator.execute('bpmnXml', payload)` | Keep snapshot/session-sync orchestration; delegate HTTP+retry+CAS. |
| `rawBpmnXml` | `createBpmnPersistence.saveRaw` direct `apiPutBpmnXml` | `saveCoordinator.execute('rawBpmnXml', payload)` | Keep runtime-cache + snapshot in `onSuccess`. |
| `meta` | `sessionPatchCasCoordinator.js` / `useSessionMetaWriteGateway.js` | `saveCoordinator.execute('meta', payload)` | Keep public API of `enqueueSessionPatchCasWrite` and `useSessionMetaWriteGateway`. |
| `analysis` | `interviewAnalysisPatchHelper.js` | `saveCoordinator.execute('analysis', payload)` | Keep sanitization and merge helpers. |

## UI integration
- `ElementSettingsControls.jsx` and `SidebarGlobalFooter.jsx` "Сохранить всё" currently calls `onSaveExtensionState` then `onSaveBpmnDocumentation`. These map to the BPMN XML pipeline. For the full-app Save All we will add `saveCoordinator.executeBatch(['bpmnXml', 'meta', 'analysis'], payloadMap)` where the caller supplies the current XML, meta, and analysis patch. Button label stays "Сохранить всё".

## Testing
- `frontend/src/features/session/__tests__/saveCoordinator.test.mjs`
  - queue serialization per session
  - debounce coalescing
  - retry with exponential backoff
  - 409 stops retry and emits conflict
  - batch sequential execution
  - status/subscription events
  - fallback `getBaseVersion` and `onSuccess` bump
- Update existing module tests to assert coordinator calls (mock `saveCoordinator.execute`).

## Out of scope
- Backend changes.
- `PATCH /api/sessions/:id/bpmn-meta` drawio visibility path will remain direct in this pass; migrate in follow-up.
- New UI/status overlay beyond subscription API.
- P0-3/4/5.

## Success criteria
1. `saveCoordinator.js` exists, singleton, with all API methods.
2. `bpmnXml`, `rawBpmnXml`, `meta`, `analysis` pipelines registered and used by migrated modules.
3. Baseline test failures remain at 33; no new failures.
4. Public APIs of migrated modules preserved.
