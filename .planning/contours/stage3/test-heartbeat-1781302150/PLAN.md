# PLAN — stage3/test-heartbeat-1781302150

## 1. Contour identity
- **contour_id**: `stage3/test-heartbeat-1781302150`
- **type**: `test`
- **subtype**: `unit-test-coverage`
- **bounded scope**: Add missing unit-test coverage for the session-presence heartbeat interval, visibility/foreground handling, and edge cases in `frontend/src/features/process/stage/presence/useSessionPresence.js`.
- **product files touched (by Worker only)**:
  - `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`

## 2. Source/runtime truth (captured at planning time)
- **repo root**: `/opt/processmap-test`
- **remote**: `git@github.com:xiaomibelov/processmap_v1.git`
- **current branch**: `analitics/analytics_work` (workspace branch; Worker will create/take a feature branch per AGENTS.md §2 if needed)
- **HEAD**: `1fb821cb99207c12c59eb1aab05f30d02eae7730`
- **origin/main**: `e1143c14f901882c12dc550f71bfd6757d60b882`
- **status**: workspace has unrelated untracked files; contour must stay isolated to the test file only.
- **test command**: `cd /opt/processmap-test/frontend && npm test -- src/features/process/stage/presence/useSessionPresence.test.mjs`
- **RAG preflight**: `/opt/processmap-test/.agents/run-state/heartbeat-1781302150/rag/RAG_PREFLIGHT.md`

## 3. Prior art / Existing patterns (from RAG)
- `SESSION_PRESENCE_HEARTBEAT_MS = 45000`, `SESSION_PRESENCE_TTL_MS = 60000`.
- Hook uses `Math.max(5000, options.heartbeatMs || SESSION_PRESENCE_HEARTBEAT_MS)`.
- Interval heartbeat is skipped when `document.visibilityState === 'hidden'`.
- `focus` and `visibilitychange` listeners trigger a foreground heartbeat when visible.
- `pagehide` / `beforeunload` trigger best-effort `leavePresence` with `keepalive: true`.

## 4. Goal
Increase confidence in the heartbeat scheduling logic of `useSessionPresence` by adding focused Node test-runner tests that exercise:
1. Periodic interval heartbeats at the configured `heartbeatMs`.
2. Suppression of interval heartbeats when the tab is hidden.
3. Resumption of heartbeats on `focus` / `visibilitychange` to visible.
4. No heartbeat when `sessionId` or `currentUserId` is missing.
5. Stable `clientId` across re-renders and unmount/remount within the same tab.
6. TTL state update from server response (`ttl_seconds` → `ttlMs`).

## 5. Acceptance criteria
- [ ] `npm test -- src/features/process/stage/presence/useSessionPresence.test.mjs` passes with all new tests.
- [ ] New tests do not change the hook implementation; only the `.test.mjs` file is modified.
- [ ] Coverage additions:
  - `interval heartbeats fire multiple times` — at least 2 interval ticks observed.
  - `hidden tab suppresses interval heartbeat` — no touch call while hidden.
  - `foreground event triggers heartbeat when visible` — a `focus` event causes a touch call.
  - `missing sessionId or userId disables heartbeat` — no touch calls.
  - `clientId is stable across re-mount in same tab` — same sessionStorage-backed id.
  - `ttlMs updates from server ttl_seconds` — non-default TTL reflected in hook return value.
- [ ] Tests use the existing `setupDom()` / `Harness` helpers and `act()` discipline.
- [ ] No secrets, no product-code changes outside the test file, no merge/PR/deploy.

## 6. Work plan for Agent 2 (Worker)
1. Read this PLAN.md, the existing `useSessionPresence.js`, and `useSessionPresence.test.mjs`.
2. Add the six test cases listed in §5 to `useSessionPresence.test.mjs`.
3. Run the targeted test command and iterate until green.
4. Run the full frontend unit test suite (`npm test`) to ensure no regressions.
5. Write `EXEC_REPORT.md` in this contour directory.
6. Create `READY_FOR_REVIEW` marker.

## 7. Review plan for Agent 3 (Reviewer)
1. Read PLAN.md, WORKER_PROMPT.md, EXEC_REPORT.md, and the diff.
2. Run the targeted test command independently.
3. Run the full frontend unit test suite.
4. Verify only `useSessionPresence.test.mjs` changed.
5. Check that new tests cover the six acceptance criteria.
6. Write `REVIEW_REPORT.md` with PASS / NEEDS_FIX verdict.

## 8. Risks & boundaries
- **Risk**: `setInterval` timing in jsdom can be flaky. Mitigation: use short `heartbeatMs` (e.g. 50 ms) and small `wait()` helpers like existing tests.
- **Risk**: Event dispatch order differs across Node versions. Mitigation: use `act()` and `await wait()` consistently.
- **Boundary**: Do not refactor `useSessionPresence.js`. If a bug is uncovered, document it and stop; do not fix as part of this test contour.

## 9. Handoff note
RAG preflight completed. No runtime UI proof required because this is a pure unit-test contour. Obsidian mirror will be triggered by `./tools/pm-agent-mirror-report.sh` after artifacts are written.
