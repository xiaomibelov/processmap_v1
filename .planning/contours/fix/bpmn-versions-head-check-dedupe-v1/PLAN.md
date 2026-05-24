# fix/bpmn-versions-head-check-dedupe-v1

## GSD Discipline

- GSD availability check performed.
- Commands executed:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 1 -type d -name 'gsd-*'` → 50+ GSD skills found
- GSD mode used: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Implementation was NOT performed.
- Product files were NOT modified.
- Contour is bounded to versions head-check dedupe.
- Agent 2 / Agent 3 gates are prepared below.

## Previous Audit Source Truth

- Previous audit contour: `audit/diagram-property-overlays-performance-gsd-v1`
- Review passed.
- Confirmed critical finding: `GET /api/sessions/{id}/bpmn/versions?limit=1` fires repeatedly during normal Diagram usage even when the BPMN history modal is never opened.
- Agent 3 independently confirmed 3x calls in ~10s window; earlier Agent 2 saw 26+ calls in a short session.
- Related but separate issue observed: `PUT /bpmn` without explicit save. **NOT fixed in this contour.** Documented as next contour: `fix/diagram-non-edit-put-bpmn-guard-v1`.
- Recently closed overlay contour: `perf/diagram-property-overlays-viewport-culling-v1` — REVIEW_PASS. Do NOT modify overlay optimization unless source proof shows versions spam is directly caused by overlay render triggers.

## Source / Runtime Truth

Captured at 2026-05-15T08:30:37+00:00:

- Working directory: `/opt/processmap-test`
- User: `root`
- Host: `clearvestnic.ru`
- Current branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- Git status: modified files include `frontend/src/components/ProcessStage.jsx`, `frontend/src/components/process/BpmnStage.jsx`, and others. No staged changes.
- Frontend runtime: `http://clearvestnic.ru:5180` → HTTP 200 OK
- API health: `http://clearvestnic.ru:8088/health` → `{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy",...}}`

## Problem Statement

`GET /api/sessions/{id}/bpmn/versions?limit=1` (the "versions head-check") is fired repeatedly during normal Diagram/BPMN idle, overlay interactions, and tab switching — even when the user never opens the BPMN history modal. This creates unnecessary API load and network noise.

The versions head-check must remain available for legitimate safety paths (history modal, create/publish version, restore version), but must not spam during ordinary diagram use.

## Exact Reproduction Plan

Documented in `RUNTIME_NAVIGATION.md`.

Summary:
- **Scenario A — normal Diagram idle**: Open session `wewe` (or any session with BPMN), open Diagram tab, do not open history modal, observe network for 10–30s. Count `GET /bpmn/versions?limit=1` calls.
- **Scenario B — overlays visible**: Keep Diagram open, ensure property overlays visible, pan/zoom lightly, count versions head-check calls.
- **Scenario C — tab switch**: Diagram → Analysis → Diagram → XML → Diagram, count versions calls.
- **Scenario D — history modal safety**: Open BPMN history/version UI, confirm versions endpoint still works. Close modal, confirm no continued polling.
- **Scenario E — save/publish safety**: Verify version state still shown correctly after non-destructive status check.

## Source Map

### Primary Target

**`frontend/src/components/ProcessStage.jsx`**
- **Role**: Versions fetch controller / head-check dedupe candidate.
- **Lines 421–422**: State `latestBpmnVersionHead` / `latestBpmnVersionHeadStatus`.
- **Lines 4287–4422**: `refreshSnapshotVersions` — list fetch with in-flight dedupe (`bpmnVersionsListRequestRef`).
- **Lines 4466–4473**: `refreshLatestBpmnRevisionHead` — thin wrapper calling `refreshSnapshotVersions({ limit: 1, updateList: false, trackHeadStatus: true })`.
- **Lines 5248–5251**: useEffect A — `if (!versionsOpen || !sid) return; void refreshSnapshotVersions();` — deps `[versionsOpen, sid, draft?.bpmn_xml_version, refreshSnapshotVersions]`. **Bounded** because guarded by `versionsOpen`.
- **Lines 5253–5262**: useEffect B — `if (!sid) return; setLatestBpmnVersionHead(null); setLatestBpmnVersionHeadStatus("loading"); void refreshLatestBpmnRevisionHead();` — deps `[sid, draft?.bpmn_xml_version, refreshLatestBpmnRevisionHead]`. **UNBOUNDED — this is the spam source.** It runs on every `draft?.bpmn_xml_version` change even when history modal is closed.
- **Line 5904**: Explicit call `await refreshLatestBpmnRevisionHead()` after BPMN import/load — **safe, keep**.

### Secondary Targets

**`frontend/src/lib/api.js`** (lines 1155–1197)
- `apiGetBpmnVersions(sessionId, options)` — API client for versions list.
- No changes needed; contract preserved.

**`frontend/src/lib/apiRoutes.js`** (lines 137–141)
- `bpmnVersions` route builder with `limit` and `include_xml` query params.
- No changes needed.

**`frontend/src/features/process/stage/orchestration/state/useProcessStageDialogState.js`**
- `versionsOpen` / `setVersionsOpen` — history modal state.
- No changes needed.

### Why it triggers repeated head-check

- useEffect B (line 5253) depends on `draft?.bpmn_xml_version`. If the session draft receives background updates, polling refreshes, or any mutation that touches `bpmn_xml_version`, the effect re-fires and issues a new `limit=1` request.
- `refreshSnapshotVersions` has in-flight dedupe, but the dedupe key is cleared after the promise resolves. There is no cooldown between completed requests and subsequent effect re-fires.
- The effect runs regardless of whether `versionsOpen` is true or false.

### Safe change area
- Guard useEffect B so it does not auto-fire on `draft?.bpmn_xml_version` changes during normal idle.
- Add cooldown/debounce or explicit trigger flags.
- Preserve explicit callers (import load, history modal open, explicit refresh).

### Forbidden change area
- Do NOT change `apiGetBpmnVersions` contract.
- Do NOT change backend versions storage or API.
- Do NOT remove BPMN history feature.
- Do NOT modify overlay viewport-culling.
- Do NOT mutate BPMN XML.

## Root-Cause Hypotheses

Agent 2 must verify and rank:

1. **H1 — Unstable dependency**: `draft?.bpmn_xml_version` changes on background session sync / auto-save / remote poll, causing useEffect B to re-fire.
2. **H2 — Tab state changes**: Tab switches may cause `draft` object identity to change even if data is stable, triggering the effect.
3. **H3 — Overlay/decor readiness**: Overlay state changes may indirectly cause `draft` refreshes.
4. **H4 — In-flight dedupe insufficient**: `bpmnVersionsListRequestRef` dedupes only while the same request is in flight. Once it resolves, a new identical request can fire immediately.
5. **H5 — No cooldown/debounce**: No minimum interval between successive head-checks.
6. **H6 — Focus/visibility**: `visibilitychange` or window focus events may trigger session re-sync that bumps `bpmn_xml_version`.
7. **H7 — Query/cache key stable but short-lived**: The request key is correct, but the ref is reset in `.finally()`, allowing immediate re-request.
8. **H8 — History modal treated as needed when closed**: useEffect B runs even when `versionsOpen === false`.
9. **H9 — Publish/create uses versions endpoint unnecessarily**: The head-check might be used for badge state that could be derived from session fields.
10. **H10 — React StrictMode**: Double-mount may cause non-idempotent effect execution, exposing the spam more severely in development.
11. **H11 — Multiple components independently head-check**: Only `ProcessStage.jsx` appears to trigger this, but verify no other component calls `apiGetBpmnVersions` with `limit=1` independently.

**Planner pre-rank**: H1 and H8 are the strongest. H4/H5 are secondary amplifiers.

## Bounded Fix Strategy

### Preferred fix

**A. Only fetch `/bpmn/versions?limit=1` when needed:**
- History modal opened (useEffect A at line 5248 already handles this).
- Explicit version/history refresh action.
- After create/publish version action completes.
- After restore version flow.
- After BPMN import/load (line 5904 already handles this).
- Documented safety-critical path only.

**B. Do not fetch on:**
- Diagram tab idle.
- Overlay visibility / pan / zoom.
- Selection changes.
- Analysis ↔ Diagram tab switch.
- XML ↔ Diagram tab switch.
- Ordinary re-render.
- Unrelated `readySignal` / `decor` state change.

**C. Add cooldown / debounce:**
- If a head-check was performed for the current `sid` within a short window (e.g., 5–10s), skip the automatic re-check unless explicitly requested.
- Store `lastHeadCheckAtMs` in a ref keyed by `sid`.

**D. Stabilize dependencies:**
- Remove `draft?.bpmn_xml_version` from useEffect B dependency array.
- Replace with an explicit trigger: only run on `sid` change, plus explicit refresh signals.
- Keep `refreshLatestBpmnRevisionHead` callback available for explicit callers.

**E. Preserve history/modal:**
- Opening history must still fetch versions (useEffect A already does this).
- Restore/version list must still work.
- Create new version / publish must still work or not be worsened.

**F. Evidence:**
- Before/after request count for Scenarios A–E.

## Acceptance Criteria

Agent 3 should pass only if:

1. During normal Diagram idle with history modal closed: `/bpmn/versions?limit=1` is **0 or at most 1 justified call after initial load**. No repeated spam over 10–30 seconds.
2. During pan/zoom/overlay interactions: **no versions head-check spam**.
3. During Analysis ↔ Diagram tab switch: **no repeated versions head-check spam**.
4. Opening history/version modal: versions endpoint **still called and data loads**.
5. No mutation requests introduced: **no PUT /bpmn, no PATCH session** from this fix path.
6. **No backend/schema/storage changes**.
7. **No BPMN XML mutation**.
8. **No Product Actions/RAG/AG-UI changes**.
9. **No regression to overlay optimization**: `.fpcPropertyOverlay` viewport-culling still works.
10. Console/network has **no new relevant errors**.

## Non-goals

- Do not fix `PUT /bpmn` without explicit save in this contour.
- Do not change backend versions storage.
- Do not change version history API contract.
- Do not remove BPMN history feature.
- Do not remove create version/publish/restore functionality.
- Do not modify overlay viewport-culling except if required for source-safe guard and documented.
- Do not change Product Actions/RAG/AG-UI.
- Do not redesign Diagram UI.
- Do not add new dependencies.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json.
2. Baseline before code:
   - Reproduce versions head-check spam using browser DevTools / Playwright.
   - Record request counts per scenario.
   - Record which hypothesis is confirmed.
3. Implement bounded fix in `frontend/src/components/ProcessStage.jsx`:
   - Guard useEffect B (line ~5253) so it does not auto-fire on `draft?.bpmn_xml_version`.
   - Add cooldown ref to prevent rapid re-checks for the same `sid`.
   - Keep all explicit callers (import load, history modal, explicit refresh).
   - Keep useEffect A (line ~5248) intact.
4. Validate:
   - `npm run build` or equivalent passes.
   - Runtime before/after: Scenarios A–E.
   - No mutation requests introduced.
   - Overlay viewport-culling not regressed.
5. Create deliverables:
   - `EXEC_REPORT.md`
   - `NETWORK_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`
6. If blocked: create `EXEC_BLOCKED.md`, do NOT create `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Read PLAN.md, EXEC_REPORT.md, NETWORK_BEFORE_AFTER.md, IMPLEMENTATION_NOTES.md, RUNTIME_PROOF_CHECKLIST.md.
2. Use Playwright / browser review.
3. Verify:
   - No versions head-check spam with history closed.
   - History modal still fetches versions.
   - Tab switching does not trigger repeated versions calls.
   - Overlay pan/zoom does not trigger versions spam.
   - No new console errors.
   - No new mutation requests.
   - No unrelated files changed.
   - Overlay viewport-culling still acceptable.
4. If even minor issue remains:
   - `CHANGES_REQUESTED`
   - `REWORK_REQUEST.md`
   - No `REVIEW_PASS`.
5. If pass:
   - `REVIEW_REPORT.md`
   - `REVIEW_PASS`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Removing `draft?.bpmn_xml_version` dep causes stale "draft ahead" badge | Low | Medium | Explicit refresh after save already updates badge from save response. Verify with Scenario E. |
| Cooldown blocks legitimate immediate refresh after publish | Low | Low | Explicit callers bypass cooldown; only auto-guarded effect uses cooldown. |
| Other component also triggers versions `limit=1` independently | Low | Low | Source map shows only `ProcessStage.jsx` calls it; Agent 2 confirms with global search. |
| Tab switch causes `sid` change and re-triggers head-check | Very Low | Low | `sid` change is expected; only 1 call per session load. |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous audit/review evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Exact versions head-check reproduction plan defined
- [x] Gate 5 — Source map captured
- [x] Gate 6 — Bounded fix strategy defined
- [x] Gate 7 — Non-goals locked
- [x] Gate 8 — Acceptance metrics defined
- [x] Gate 9 — Agent 2 executor prompt ready
- [x] Gate 10 — Agent 3 reviewer prompt ready
- [x] Gate 11 — READY_FOR_EXECUTION marker created
