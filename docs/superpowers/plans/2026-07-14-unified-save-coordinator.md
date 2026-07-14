# Unified Save Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every code change. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Create a singleton `saveCoordinator` that unifies BPMN XML, session meta, and interview-analysis save pipelines on top of `casVersionTracker`, then migrate existing consumers while preserving their public APIs.

**Architecture:** A singleton coordinator owns per-session queues, per-pipeline debounce, retry with exponential backoff, and an event emitter. Each consumer registers a pipeline config and calls `execute`. Post-save side effects (snapshots, session sync) stay in the consumer or in pipeline hooks.

**Tech Stack:** ES modules, Node test runner, existing `casVersionTracker.js`, existing `apiPatchSession` / `apiPutBpmnXml` / `apiGetSession` helpers.

---

## Task 1: `saveCoordinator` core (queue, debounce, retry, events)

**Files:**
- Create: `frontend/src/features/session/saveCoordinator.js`
- Test: `frontend/src/features/session/__tests__/saveCoordinator.test.mjs`

- [ ] **Step 1: Write the failing test — queue serializes per session**

```js
test('queues concurrent saves for the same session', async () => {
  const order = [];
  const coordinator = createSaveCoordinator();
  coordinator.registerPipeline('p1', {
    endpoint: () => '/x',
    method: 'PUT',
    buildPayload: () => ({}),
    execute: async () => {
      order.push('start');
      await sleep(10);
      order.push('end');
      return { ok: true };
    },
  });
  const p1 = coordinator.execute('p1', { sessionId: 's1' });
  const p2 = coordinator.execute('p1', { sessionId: 's1' });
  await Promise.all([p1, p2]);
  assert.deepEqual(order, ['start', 'end', 'start', 'end']);
});
```

Run: `npm test -- frontend/src/features/session/__tests__/saveCoordinator.test.mjs`
Expected: FAIL (`createSaveCoordinator` not defined).

- [ ] **Step 2: Implement minimal coordinator skeleton**

Create `saveCoordinator.js` exporting:
- `createSaveCoordinator()` factory (allows isolated test instances).
- `saveCoordinator` singleton instance.
- Methods: `registerPipeline`, `execute`, `executeBatch`, `getStatus`, `getGlobalStatus`, `subscribe`, `unsubscribe`, `hasUnsavedChanges`.

Use a `Map` of pipeline configs, a `Map` of per-session queue tails, a `Set` of subscribers, and a `Map` of per-(pipeline,session) debounce timers.

- [ ] **Step 3: Run test, verify green**

Expected: PASS.

- [ ] **Step 4: Add debounce test and implement debounce**

Test: rapid calls coalesce to one execution.
Implement: when `debounceMs > 0`, store pending `{ payload, timer }`; on new call clear timer and restart; timer fires the actual request.

- [ ] **Step 5: Add retry/backoff test and implement retry**

Test: third attempt succeeds; delays are ~1s, ~2s.
Implement: `for (let attempt = 0; attempt <= retryCount; attempt++)`; on failure sleep `retryDelayMs * 2^attempt` unless final or 409.

- [ ] **Step 6: Add 409 test and implement conflict handling**

Test: 409 returns immediately, calls `on409`, emits `conflict` event, no retry.
Implement: if response indicates 409 (configurable `isConflict` or pipeline `on409`), call `on409`, emit, return.

- [ ] **Step 7: Add batch/sequential test and implement `executeBatch`**

Test: `executeBatch(['a','b'], { a: {...}, b: {...} })` runs a then b.
Implement: sequential `for...of` over names, calling `execute(name, payloadMap[name])`.

- [ ] **Step 8: Add status/event tests and finalize emitter**

Test: `subscribe` receives `status`, `success`, `error`, `conflict` events.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/session/saveCoordinator.js \
  frontend/src/features/session/__tests__/saveCoordinator.test.mjs
git commit -m "feat(session): saveCoordinator core + pipeline registry"
```

---

## Task 2: Register and integrate the `bpmnXml` pipeline

**Files:**
- Modify: `frontend/src/features/process/save/saveBpmnState.js`
- Modify: `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`
- Test: existing `saveBpmnState.property-pipeline.test.mjs`, `createBpmnPersistence.test.mjs`

- [ ] **Step 1: Register `bpmnXml` pipeline in `saveBpmnState.js`**

At module load, call:
```js
saveCoordinator.registerPipeline('bpmnXml', {
  endpoint: (sessionId) => apiRoutes.sessions.bpmn(sessionId),
  method: 'PUT',
  buildPayload: ({ xml, rev, sourceAction, bpmnMeta, baseDiagramStateVersion }) => ({ ... }),
  getBaseVersion: (sessionId) => getTrackedDiagramStateVersion(sessionId),
  onSuccess: (response, sessionId) => bumpTrackedDiagramStateVersion(sessionId, response.diagramStateVersion),
  on409: (response, sessionId) => { rollbackTrackedDiagramStateVersion(sessionId); ... },
  debounceMs: 0,
  retryCount: 3,
  retryDelayMs: 1000,
});
```

- [ ] **Step 2: Replace direct `apiPutBpmnXml` call in `saveBpmnState.js` with `saveCoordinator.execute('bpmnXml', ...)`**

Keep XML acquisition, local-session short-circuit, conflict callback, snapshot/session-sync post-processing.

- [ ] **Step 3: Register `rawBpmnXml` pipeline in `createBpmnPersistence.js`**

Include runtime-cache write in `onSuccess`. Keep `saveRaw` public API.

- [ ] **Step 4: Update tests to mock `saveCoordinator.execute` or use the real pipeline with a fake endpoint**

Ensure existing behavior (storedRev, diagramStateVersion, conflict details, snapshots) still passes.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(session): migrate saveBpmnState/createBpmnPersistence to coordinator"
```

---

## Task 3: Migrate `meta` and `analysis` pipelines

**Files:**
- Modify: `frontend/src/features/process/stage/utils/sessionPatchCasCoordinator.js`
- Modify: `frontend/src/features/session-meta/write/useSessionMetaWriteGateway.js`
- Modify: `frontend/src/features/process/analysis/interviewAnalysisPatchHelper.js`
- Test: `sessionPatchCasCoordinator.test.mjs`, `useSessionMetaWriteGateway.test.mjs`, `interviewAnalysisPatchHelper.test.mjs`

- [ ] **Step 1: Register `meta` pipeline**

Endpoint `apiPatchSession`, payload `{ ...patch, base_diagram_state_version }`, `onSuccess` bumps from `response.session.diagram_state_version`.

- [ ] **Step 2: Refactor `sessionPatchCasCoordinator.js` to a facade**

`enqueueSessionPatchCasWrite` becomes:
```js
return saveCoordinator.execute('meta', { sessionId, patch, apiPatchSession, getBaseDiagramStateVersion, rememberDiagramStateVersion });
```

- [ ] **Step 3: Refactor `useSessionMetaWriteGateway.js`**

Keep `persistSessionMeta` API; internally use `saveCoordinator.execute('meta', ...)` instead of `enqueueSessionPatchCasWrite`.

- [ ] **Step 4: Register `analysis` pipeline and refactor `interviewAnalysisPatchHelper.js`**

Pipeline builds `{ interview: { analysis } }` with optional base version. Keep public `patchInterviewAnalysis`.

- [ ] **Step 5: Update tests to assert coordinator integration**

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(session): migrate interviewAnalysisPatchHelper/meta gateway to coordinator"
```

---

## Task 4: "Сохранить всё" batch integration

**Files:**
- Modify: `frontend/src/components/sidebar/ElementSettingsControls.jsx` (the actual "Сохранить всё" chain)
- Modify: `frontend/src/components/sidebar/SidebarGlobalFooter.jsx` if it receives `onSaveAll`
- Modify: `frontend/src/components/NotesPanel.jsx` to pass the batch handler down if needed

- [ ] **Step 1: Locate the real Save All chain**

It is in `ElementSettingsControls.jsx:1981-1985` (`handleSaveAll` calls `onSaveExtensionState` then `onSaveBpmnDocumentation`). The user referenced `NotesPanel.jsx` but the code lives here.

- [ ] **Step 2: Add a prop `onSaveAllBatch` from `NotesPanel.jsx` down to `ElementSettingsControls.jsx`**

`onSaveAllBatch` calls `saveCoordinator.executeBatch(['bpmnXml', 'meta', 'analysis'], payloadMap)`.

- [ ] **Step 3: Replace `handleSaveAll` body**

```js
async function handleSaveAll() {
  if (disabled) return;
  await onSaveAllBatch?.();
}
```

Keep button label and busy state derived from coordinator global status.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(sidebar): use saveCoordinator.executeBatch for Save All"
```

---

## Task 5: Verification and docs

- [ ] **Step 1: Run full frontend test suite**

```bash
cd frontend && npm test
```

Confirm failure count = 33 (baseline).

- [ ] **Step 2: Run build**

```bash
cd frontend && npm run build
```

Confirm no new build errors.

- [ ] **Step 3: Update WORKER_REPORT.md and mirror**

Write `/tmp/save_coordinator/WORKER_REPORT.md`, scp, mirror.

- [ ] **Step 4: Push branch**

```bash
git push origin fix/unified-cas-version-tracker
```

Do not open a PR without explicit approval.

---

## Self-review checklist

- [ ] No placeholders ("TBD", "TODO", etc.).
- [ ] Every new function covered by a test.
- [ ] Public APIs of `saveBpmnState`, `createBpmnPersistence`, `sessionPatchCasCoordinator`, `useSessionMetaWriteGateway`, `interviewAnalysisPatchHelper` unchanged.
- [ ] `casVersionTracker` is the only version store.
- [ ] No new test failures.
