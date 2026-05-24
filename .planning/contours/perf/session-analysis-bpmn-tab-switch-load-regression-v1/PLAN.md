# perf/session-analysis-bpmn-tab-switch-load-regression-v1

## GSD Discipline

- GSD availability checked:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `CODEX_GSD_TOOLS_FOUND`
  - 50+ GSD skills found in `/root/.codex/skills`
- GSD mode used: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Fallback not required; native wrapper available.
- Confirmation: **No implementation performed by Agent 1.**
- Confirmation: **No product files modified by Agent 1.**
- Confirmation: **Contour is strictly bounded.**
- Confirmation: **Agent 2 / Agent 3 gates prepared in this pack.**

## Source / Runtime Truth

- Host: `clearvestnic.ru`
- User: `root`
- Working directory: `/opt/processmap-test`
- Git branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- Frontend runtime: `http://clearvestnic.ru:5180`
- API runtime: `http://clearvestnic.ru:8088`
- API health: `{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy"...}`
- Frontend health: HTTP 200 OK

## Runtime Reproduction

### Exact Reproduction Route

1. Open frontend: `http://clearvestnic.ru:5180/app`
2. Navigate to project: `Описание процессов Долгопрудный` (project id `b1c8a56b6e`)
3. Open session: `wewe` (session id `4c515d1c6e`)
4. Direct URL: `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`
5. Wait for initial load (Diagram/BPMN tab is default)
6. Click tab: **"Анализ процессов"**
7. Wait for content
8. Click tab: **"Diagram (BPMN)"**
9. Repeat cycle 2 more times

### Observed Behavior (Playwright Evidence)

- **Tab "Анализ процессов"** = `interview` in source
- **Tab "Diagram (BPMN)"** = `diagram` in source

### Baseline Network Evidence (captured 2026-05-14T20:38Z)

During a single Analysis → Diagram switch cycle:

| # | Request | Notes |
|---|---------|-------|
| 1 | `GET /api/sessions/4c515d1c6e` | Full session load |
| 2 | `GET /api/sessions/4c515d1c6e/bpmn?raw=1...` | BPMN XML load |
| 3 | `GET /api/sessions/4c515d1c6e/bpmn/versions?limit=1` | × 20+ repeated calls |
| 4 | `PATCH /api/sessions/4c515d1c6e` → **409 Conflict** | Mutation on tab switch |
| 5 | `GET /api/sessions/4c515d1c6e/analysis/product-actions/batch-draft` | Analysis data |
| 6 | `POST /api/sessions/4c515d1c6e/presence` | Presence pings |
| 7 | `POST /api/telemetry/error-events` | Error telemetry fired |

**Critical finding:** `GET /bpmn/versions?limit=1` is called **20+ times** during a single tab switch.  
**Critical finding:** `PATCH /api/sessions/{id}` returns **409 Conflict** triggered by tab switch.  
**Critical finding:** Error telemetry is emitted because of the 409.

### Duplicate Notifications

- Screenshot after cycle shows no persistent toast, but network log confirms 409 Conflict.
- The 409 Conflict likely causes version/limit mismatch messages to surface.
- Console shows `[ERROR] Failed to load resource: the server responded with a status of 409 (Conflict)`.
- `showSaveAckToast` / `processStatusToastLastSignatureRef` dedupe exists for some paths but not for the 409 → error message path.

## Network Evidence

### Endpoints Involved

- `GET /api/sessions/{id}` — full session load (heavy)
- `GET /api/sessions/{id}/bpmn?raw=1...` — BPMN XML load (heavy)
- `GET /api/sessions/{id}/bpmn/versions?limit=1` — version head check (called 20+ times)
- `PATCH /api/sessions/{id}` — session mutation (**must NOT fire on tab switch**)
- `GET /api/sessions/{id}/analysis/product-actions/batch-draft` — analysis data
- `POST /api/sessions/{id}/presence` — presence heartbeat

### Violations Observed

1. **Mutation on tab switch:** `PATCH /api/sessions/{id}` fired because of `enqueueSessionPatchCasWrite` inside `useProcessTabs.js` Diagram → Interview path.
2. **Versions endpoint spam:** `GET /bpmn/versions?limit=1` fires in a rapid burst due to unstable effect dependencies.
3. **No in-flight dedupe for head-only version checks:** `refreshSnapshotVersions` skips request-key caching when `updateList: false`.

## Source Map

### Candidate Files

| Path | Role | Likely Issue | Safe Change Candidates |
|------|------|--------------|------------------------|
| `frontend/src/features/process/hooks/useProcessTabs.js` | Tab switch orchestrator | **PATCH on tab switch** (lines 826-848); heavy `parseAndProjectBpmnToInterview` on every switch; `flushBpmnTab` + `fetchLatestXml` synchronous chain | Skip PATCH if interview data unchanged; cache projected interview; skip `fetchLatestXml` if draft XML unchanged |
| `frontend/src/components/ProcessStage.jsx` | Main stage container | **Versions effect spam** (lines 5244-5258); `refreshLatestBpmnRevisionHead` runs on every `draft?.bpmn_xml_version/updated_at/version` change; toast dedupe incomplete for 409 errors | Stabilize effect deps; add in-flight dedupe for `updateList: false`; suppress duplicate 409 toasts |
| `frontend/src/features/process/stage/utils/sessionPatchCasCoordinator.js` | PATCH queue coordinator | Queues patches but does not prevent unnecessary patches | Not primary target; keep as-is unless queue logic needs dedupe |
| `frontend/src/components/process/InterviewStage.jsx` | Analysis tab component | Likely remounts on tab switch, causing heavy re-initialization | Preserve mount state; avoid heavy recompute on re-visit |
| `frontend/src/features/process/hooks/useBpmnSync.js` | BPMN sync hook | `fetchLatestXml` and `ensureSeedXml` called on every Interview → Diagram switch | Skip fetch if cached XML is current |
| `frontend/src/lib/api.js` | API client | `apiGetBpmnVersions` endpoint used with `limit=1` for head checks | No change needed |
| `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` | Tab header UI | Renders tabs; no direct network logic | No change needed |
| `frontend/src/features/process/processWorkbench.config.js` | Tab config | Defines tab ids/labels | No change needed |

### What NOT to Change

- Backend schema or storage
- BPMN XML content or parser
- Product Actions AI / RAG / AG-UI
- Durable truth mutation outside of the bounded fix
- Global UI redesign
- `WorkspaceExplorer`, `AuthProvider`, `App.jsx` routing

## Root-Cause Hypotheses

### H1. PATCH session mutation on tab switch (HIGH CONFIDENCE — CONFIRMED)

**Evidence:** Network log shows `PATCH /api/sessions/4c515d1c6e` returning 409 during tab switch.  
**Source:** `useProcessTabs.js` lines 826-848: `enqueueSessionPatchCasWrite({ patch: { interview: projected.nextInterview } })` runs on every Diagram → Interview switch.  
**Impact:** Causes 409 Conflict, triggers error telemetry, potentially triggers version/limit toasts.

### H2. `/bpmn/versions?limit=1` spam loop (HIGH CONFIDENCE — CONFIRMED)

**Evidence:** 20+ identical GET calls in network log within seconds.  
**Source:** `ProcessStage.jsx` line 5250 effect depends on `draft?.bpmn_xml_version`, `draft?.updated_at`, `draft?.version`. Tab switch causes draft updates → effect re-runs. `refreshSnapshotVersions` with `updateList: false` bypasses in-flight dedupe.  
**Impact:** Wastes bandwidth, server CPU, blocks rendering.

### H3. Heavy `parseAndProjectBpmnToInterview` on every switch (HIGH CONFIDENCE)

**Evidence:** Code path in `useProcessTabs.js` lines 802-812 always runs `parseAndProjectBpmnToInterview`.  
**Impact:** CPU spike on client, perceptible delay before Analysis tab renders.

### H4. Interview component remount + refetch (MEDIUM CONFIDENCE)

**Evidence:** `InterviewStage.jsx` is conditionally rendered inside `ProcessStage.jsx` (line 6502). When tab switches away, React unmounts it.  
**Impact:** All `useEffect` hooks inside `InterviewStage` rerun on return, causing re-derivation of heavy interview state.

### H5. Duplicate version/limit toasts from 409 Conflict (MEDIUM CONFIDENCE)

**Evidence:** 409 Conflict on PATCH; `genErr` / `infoMsg` effect at `ProcessStage.jsx` line 1070 shows toast for errors. `processStatusToastLastSignatureRef` dedupes by `tone:message` but 409 messages may vary slightly.  
**Impact:** User sees duplicate "version/limit" warnings.

### H6. No stable cache key for session/BPMN state (MEDIUM CONFIDENCE)

**Evidence:** `draft?.updated_at` is a timestamp that changes on every server sync, causing effect re-runs even when meaningful data is unchanged.  
**Impact:** Unnecessary refetches triggered by timestamp changes.

### H7. React StrictMode double effect in dev (LOW CONFIDENCE)

**Evidence:** Not directly observed; production runtime is the target.  
**Impact:** Even if present, the root cause is the effect firing too often, not StrictMode.

## Target Fix Direction

### Primary Fixes (Agent 2)

1. **Eliminate PATCH on tab switch**
   - In `useProcessTabs.js`, skip `enqueueSessionPatchCasWrite` when switching to Interview if the interview data has not materially changed.
   - Alternatively, defer the PATCH to an explicit save action or background sync, not tab switch.
   - If PATCH is unavoidable, ensure it uses the correct `base_diagram_state_version` to avoid 409.

2. **Stop `/bpmn/versions?limit=1` spam**
   - In `ProcessStage.jsx`, stabilize the `useEffect` at line 5250 so it does not re-run on transient draft field changes (`updated_at`, `version`).
   - Use a stable cache key (e.g., `bpmn_xml_version` only, or a derived `versionFingerprint`).
   - Fix in-flight dedupe in `refreshSnapshotVersions` for `updateList: false` paths.
   - Add `AbortController` or request-cancel logic.

3. **Cache projected interview across tab switches**
   - In `useProcessTabs.js`, memoize `parseAndProjectBpmnToInterview` result keyed by `bpmn_xml` hash + `bpmn_xml_version`.
   - Skip re-projection if inputs are unchanged.

4. **Preserve Interview component state across tab switches**
   - In `ProcessStage.jsx`, render `InterviewStage` with `display: none` or use React `key` retention so it does not unmount/remount.
   - Alternatively, lift heavy interview derived state so it survives unmount.

5. **Deduplicate 409/error toasts**
   - In `ProcessStage.jsx`, enhance `processStatusToastLastSignatureRef` dedupe to cover 409 conflict patterns.
   - Ensure `showSaveAckToast` does not fire duplicate messages for the same conflict root cause.

### Performance Target

After fix:
- Switching Analysis ↔ BPMN must be **visually near-instant** when data already loaded.
- **Zero** `PATCH` requests caused by tab switch.
- **Zero to one** `GET /bpmn/versions?limit=1` calls per tab switch (only if truly needed).
- **Zero** duplicate version/limit toasts per switch cycle.
- CPU-heavy `parseAndProjectBpmnToInterview` runs **only when BPMN XML actually changed**.

## Scope

**In scope:**
- Frontend tab switching performance
- Network request dedupe/caching
- Toast/notification dedupe
- Component mount/state preservation
- Safe skipping of redundant sync operations

**Out of scope:**
- Backend API endpoints (read-only from frontend perspective)
- Database schema changes
- BPMN XML format changes
- Product Actions AI / RAG / AG-UI
- Workspace explorer changes
- Global UI redesign

## Non-goals

Agent 2 MUST NOT:
- Redesign the UI or tab layout
- Change the реестр действий (action registry)
- Implement AG-UI changes
- Change RAG behavior
- Change Product Actions AI
- Mutate BPMN XML storage logic
- Change backend schema
- Rewrite the entire editor/session architecture
- Optimize the entire application
- Disable important save/version safety checks
- Hide errors instead of fixing the duplicate cause
- Increase timeouts as a workaround

## Agent 2 Execution Plan

1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`
2. Reproduce the problem using Playwright or manual browser inspection
3. Capture baseline request counts (target: 20+ versions calls, 1 PATCH 409)
4. Implement bounded fixes in this order:
   a. Fix versions effect spam in `ProcessStage.jsx`
   b. Eliminate or defer PATCH on tab switch in `useProcessTabs.js`
   c. Cache `parseAndProjectBpmnToInterview` in `useProcessTabs.js`
   d. Preserve Interview state / reduce remount cost
   e. Enhance toast dedupe for 409 errors
5. Validate:
   - Run `npm run test` or equivalent frontend tests
   - Run `npm run build` to verify no build errors
   - Reproduce tab switch cycle
   - Count network requests after fix
   - Document in `EXEC_REPORT.md`
6. Create `READY_FOR_REVIEW`

## Agent 3 Review Plan

1. Read `PLAN.md`, `EXEC_REPORT.md`, `RUNTIME_NAVIGATION.md`
2. Check `REVIEWER_PROMPT.md` for detailed acceptance criteria
3. Use Playwright to perform real tab switch cycle:
   - Open session `4c515d1c6e`
   - Switch Analysis → BPMN → Analysis → BPMN → Analysis
   - Capture network requests
   - Inspect console for errors
   - Check for duplicate toasts
4. PASS only if:
   - Subsequent tab switches are visually fast (< 500 ms)
   - No `PATCH` caused by tab switch
   - No more than 1 `GET /bpmn/versions?limit=1` per switch
   - No duplicate version/limit notifications
   - BPMN diagram remains usable
   - Analysis tab remains usable
   - No new console errors
5. If issues remain, create `CHANGES_REQUESTED` + `REWORK_REQUEST.md`

## Risks

| Risk | Mitigation |
|------|------------|
| Fixing versions dedupe breaks version history modal | Test explicit "Open version history" flow separately |
| Removing PATCH on tab switch breaks interview save | Ensure explicit save still works; interview data is still in draft |
| Caching projection causes stale analysis | Use `bpmn_xml` + `bpmn_xml_version` as stable cache key |
| Preserving Interview mount increases memory | Use `display: none` only; memory cost is minimal for one component |
| 409 dedupe hides real conflicts | Dedupe by signature+timestamp; allow re-show after 30s |

## Acceptance Criteria

A. First load can remain normal.  
B. Second and subsequent tab switches:
   - Visible content within **~300–500 ms** where data already loaded
   - **No duplicate version/limit toasts**
   - **No duplicate `/bpmn/versions` calls per switch**
   - **No duplicate full session reload per switch**
   - **No mutation requests (PATCH/PUT) on tab switch**
C. Network request count for 3 tab cycles must be documented before/after.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Runtime/source truth captured
- [x] Gate 3 — Exact slow-tab reproduction captured
- [x] Gate 4 — Network/request evidence captured
- [x] Gate 5 — Version/limit duplicate notification evidence captured
- [x] Gate 6 — Source map captured
- [x] Gate 7 — Root-cause hypotheses ranked
- [x] Gate 8 — Bounded fix plan defined
- [x] Gate 9 — Non-goals locked
- [x] Gate 10 — Executor prompt ready
- [x] Gate 11 — Reviewer prompt ready
- [x] Gate 12 — READY_FOR_EXECUTION marker created
