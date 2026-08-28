# FIX: Session Version Conflict — base version hydration + cross-session writer

**Contour:** `fix/session-version-conflict-base-hydration-v1`  
**Status:** `READY_FOR_REVIEW` (no merge/deploy without explicit user approve)  
**Baseline:** `origin/main @ 95fc4d897e8f05e36543c33ed54c439e13723cde`  
**Worktree:** `/Users/mac/agents_place/kimi_PM/fix-session-version`  
**Branch:** `fix/session-version-conflict-base-hydration-v1`  

---

## 1. Git proof

```text
$ git status -sb
## fix/session-version-conflict-base-hydration-v1
 M frontend/src/components/ProcessStage.jsx
 M frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js
 M frontend/src/features/process/bpmn/persistence/createBpmnPersistence.test.mjs
 M frontend/src/features/process/hooks/useProcessTabs.cas-base-propagation.test.mjs
 M frontend/src/features/process/hooks/useProcessTabs.js

$ git rev-parse HEAD
95fc4d897e8f05e36543c33ed54c439e13723cde

$ git diff --stat
 frontend/src/components/ProcessStage.jsx           | 10 +++---
 .../bpmn/persistence/createBpmnPersistence.js      | 21 ++++++++++--
 .../persistence/createBpmnPersistence.test.mjs     | 38 +++++++++++++++++++---
 .../useProcessTabs.cas-base-propagation.test.mjs   |  9 +++++
 .../src/features/process/hooks/useProcessTabs.js   | 35 ++++++++++++++++++--
 5 files changed, 101 insertions(+), 12 deletions(-)
```

---

## 2. H6 investigation — cross-session pollution

### 2.1 Backend mass writes

**Verdict: refuted.**

Searched `backend/app/` for `UPDATE sessions` / `sessions SET` / mass updates by `project_id`.
- `storage.py:save()` (`storage.py:4725`) performs `UPDATE sessions ... WHERE id = :id AND diagram_state_version = :__cas_base` — single-row, CAS-guarded.
- `storage.py:patch_session_meta()` (`storage.py:5050`) performs `UPDATE sessions ... WHERE id = ? AND diagram_state_version = ?` — single-row, CAS-guarded.
- `storage.py:patch_session_interview()` (`storage.py:5124`) performs `UPDATE sessions ... WHERE id = ?` — single-row.
- `storage.py:3737`, `3760`, `3767` are schema-migration backfills for `org_id` / `created_by` / `updated_by` (`_ensure_schema`), not runtime writes.
- No `UPDATE sessions ... WHERE project_id = ?` or project-level rollup that touches sibling sessions was found.

**Conclusion:** there is no backend writer that bumps `updated_at` / `diagram_state_version` for all sessions in a project. The "all 4 sessions updated" symptom is therefore either a frontend list/cache artifact or a misinterpretation of relative timestamps.

### 2.2 Frontend version-tracker keying

**Verdict: tracker is per-session; external/draft getters are context-bound, not sid-keyed (known smell, not proven as primary cause).**

- `frontend/src/lib/casVersionTracker.js` uses a `Map` keyed by `sessionId` (`setVersion`, `getVersion`, `bumpVersion`). Verified by unit test.
- `createBpmnPersistence.js:readExternalBaseDiagramStateVersion()` reads from the closure `getExternalBaseDiagramStateVersion()` without a `sessionId`. The wiring in `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js:169` binds it to `readOnly.getBaseDiagramStateVersion()`, which returns the **active** session's version. Because `saveRaw` is always called for the active `sessionId`, this is acceptable in the current architecture, but it remains a latent cross-session footgun if the wiring is ever reused across inactive sessions.
- `readDraftDiagramStateVersion()` likewise reads the current draft without a `sessionId`. Again safe while the caller only saves the active session.

**Conclusion:** no active keying bug was found that would cause version from session A to leak into session B during normal use.

### 2.3 Background save loops across sessions

**Verdict: refuted.**

Searched `frontend/src/features/process/` for `setInterval` / recurring `setTimeout` that could iterate sessions:
- `useAutosaveQueue.js` is instantiated per `ProcessStage`; it schedules a single pending save for the current session only.
- `createBpmnCoordinator.js` uses `setTimeout` for drag/save debounce on the active canvas.
- `useBpmnSync.js` receives `sessionId` and operates only on that `sid`.
- No global scheduler or loop over `projectSessionsQuery` data was found.

---

## 3. Code changes

### 3.1 `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`

- `resolveBaseDiagramStateVersion` (~line 337): when `trackedVersion`, `externalVersion` and `draftVersion` are all missing, now returns `null` instead of `0`.
- `saveRaw` (~line 686): if `baseDiagramStateVersion === null`, aborts before calling `saveCoordinator.execute`, returns `{ ok: false, reason: "missing_base_version", needsHydration: true }`.

### 3.2 `frontend/src/features/process/hooks/useProcessTabs.js`

- Imported `apiGetSession`.
- Added `hydrateBaseDiagramStateVersion` (~line 330): fetches the session, reads `diagram_state_version`, calls `rememberDiagramStateVersion`.
- `flushBpmnTab` (~line 330): before force-flushing, checks `getBaseDiagramStateVersion()`. If it is not finite / `< 0`, awaits hydration; on failure returns `{ ok: false, reason: "hydration_failed", error: ... }`.

### 3.3 `frontend/src/components/ProcessStage.jsx`

- `diagramStateVersionRef` initial value changed from `0` to `null`.
- The `useEffect` that syncs `diagramStateVersionRef` from `draft.diagram_state_version` now preserves `null` when the draft has not yet supplied a version, so callers can distinguish "not loaded" from "server version 0".
- Reset-canvas path also clears the ref to `null` instead of `0`.

---

## 4. Tests

### 4.1 Added / updated

- `createBpmnPersistence.test.mjs`
  - `saveRaw returns missing_base_version when base diagram state version is not known`
  - `tracked diagram state version is scoped by session id`
  - Updated 3 existing tests to include `diagram_state_version: 0` in the draft fixture, matching the new "base must be known" contract.
- `useProcessTabs.cas-base-propagation.test.mjs`
  - `tab-switch bpmn flush hydrates base diagram state version before remote save` (structural)

### 4.2 Test results

```text
# createBpmnPersistence.test.mjs
# tests 14
# pass 14
# fail 0

# useProcessTabs.*.test.mjs
# tests 7
# pass 7
# fail 0

# persistRetryMachine.test.mjs
# tests 3
# pass 3
# fail 0

# ProcessStage.diagram-state-version-context.test.mjs + ProcessStage.cas-base-propagation.test.mjs
# tests 6
# pass 6
# fail 0
```

Full `npm test` could not be run in this environment because host `node`/`npm` are unavailable and the Docker `node:20-alpine` runner lacks `node_modules` (React, `@babel/parser`, `jsdom`). The targeted test suites above pass without dependencies.

---

## 5. Evidence gate status

Prod evidence requested in audit (Network response/payload, DB rows, backend logs) has **not** been provided. Therefore:
- H2 (base=0 fallback) is closed by code.
- H4/H6 are not proven by runtime evidence.
- The fix is defensive; verdict in PR is **PARTIAL**.
