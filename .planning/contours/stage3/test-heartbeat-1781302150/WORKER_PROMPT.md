# WORKER_PROMPT — stage3/test-heartbeat-1781302150

You are Agent 2 / Worker for ProcessMap.

## Identity
- **contour_id**: `stage3/test-heartbeat-1781302150`
- **type**: `test`
- **role**: Implement the test coverage described in PLAN.md.

## Working directory
`/opt/processmap-test`

## Container note
`/app` in container = `/opt/processmap-test/frontend` on host.

## Rules
- Do NOT write product code outside the test file.
- Do NOT merge/deploy/PR.
- Do NOT print secrets.
- Use atomic writes (`*.tmp` → `mv`).
- If you uncover a bug in `useSessionPresence.js`, document it in `EXEC_REPORT.md` and stop; do not fix product code in this contour.

## Source files to read
1. `.planning/contours/stage3/test-heartbeat-1781302150/PLAN.md`
2. `frontend/src/features/process/stage/presence/useSessionPresence.js`
3. `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`
4. `frontend/src/features/process/stage/presence/sessionPresenceConstants.js`

## Task
Add the following six focused unit tests to `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`:

1. **Interval heartbeats fire multiple times**
   - Render with `heartbeatMs: 50`.
   - Wait long enough for at least two interval ticks after mount.
   - Assert `calls.length >= 3` (mount + 2 intervals).

2. **Hidden tab suppresses interval heartbeat**
   - Render with `heartbeatMs: 50`.
   - Set `document.visibilityState = 'hidden'` and dispatch `visibilitychange`.
   - Wait for several heartbeat periods.
   - Assert no additional touch calls occurred while hidden.

3. **Foreground event triggers heartbeat when visible**
   - Render with `heartbeatMs: 5000` (long, so interval does not interfere).
   - Dispatch a `focus` event on `window`.
   - Assert an additional touch call was made with reason mapping to foreground logic.

4. **Missing sessionId or userId disables heartbeat**
   - Render with empty `sessionId` or empty user object.
   - Wait and assert `calls.length === 0` and `activeUsers` is empty.

5. **clientId is stable across re-mount in same tab**
   - Render, unmount, then render again in the same jsdom tab (same `sessionStorage`).
   - Assert the second mount reuses the same `clientId`.

6. **ttlMs updates from server ttl_seconds**
   - Return `ttl_seconds: 120` from the mock `apiTouch`.
   - Assert `latest.ttlMs === 120000` after mount heartbeat.

## Test style
- Reuse existing helpers: `setupDom()`, `Harness`, `wait()`, `act()`.
- Keep assertions strict but avoid over-specifying internal implementation details.
- Clean up in `finally` blocks like existing tests.

## Commands to run
```bash
cd /opt/processmap-test/frontend
npm test -- src/features/process/stage/presence/useSessionPresence.test.mjs
npm test
```

## Deliverables in `.planning/contours/stage3/test-heartbeat-1781302150/`
- `EXEC_REPORT.md` (summary, commands run, results, any blockers)
- `READY_FOR_REVIEW` (empty marker file or directory)

## State update
After completing, update `STATE.json`:
```json
{
  "contour_id": "stage3/test-heartbeat-1781302150",
  "phase": "ready_for_review",
  "planner_status": "complete",
  "worker_status": "complete",
  "reviewer_status": "pending"
}
```

## Final step
Run `./tools/pm-agent-mirror-report.sh "stage3/test-heartbeat-1781302150" worker` after deliverables are written.
