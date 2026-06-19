# Worker Prompt: stage4/test-timeout-1781303549

## Goal

Deliver the bounded contour exactly as described in `PLAN.md`: remove the 5000 ms heartbeat clamp in `useSessionPresence.js` and make the corresponding tests fast and consistent.

## Source Truth Commands

Run before editing:

```bash
cd /opt/processmap-test
git fetch origin
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

The current branch is `analitics/analytics_work`, which is unrelated to this contour. Prefer to do the work on a clean branch cut from `origin/main` (e.g., `fix/session-presence-test-timeout`). If switching branches, preserve the uncommitted changes to `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs` by stashing or committing them on the new branch. Stop if unrelated dirty files block the contour.

## GSD Local Requirement

Use local GSD scripts/skills only if they help validate the contour. Record what was found and used in `EXEC_REPORT.md`.

## Scope

Read `PLAN.md`. Change only:

- `frontend/src/features/process/stage/presence/useSessionPresence.js`
- `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`

## Non-goals

Do not change other product frontend/backend code, DB/schema, BPMN XML save logic, AI/RAG/Product Actions logic, deployment, merge, or PR state.

## Implementation Steps

1. Read `PLAN.md`.
2. Verify source truth (commands above).
3. In `useSessionPresence.js`, locate:
   ```js
   const heartbeatMs = Math.max(5000, Number(options.heartbeatMs || SESSION_PRESENCE_HEARTBEAT_MS));
   ```
   Replace it with code that honors an explicit finite positive `options.heartbeatMs` while keeping the default `SESSION_PRESENCE_HEARTBEAT_MS` when none is provided. For example:
   ```js
   const heartbeatMs = Number(options.heartbeatMs || SESSION_PRESENCE_HEARTBEAT_MS);
   ```
4. In `useSessionPresence.test.mjs`, find tests that wait 6500 ms or 12000 ms. Reduce those waits to sub-second values consistent with the `heartbeatMs` passed in the test (e.g., 50 ms → wait ~150–300 ms). Adjust the expected `calls.length` assertions to match the shorter interval.
5. Remove comments that state the hook clamps to 5000 ms.
6. Run the validation commands listed in `PLAN.md`.
7. Write `EXEC_REPORT.md` in `.planning/contours/stage4/test-timeout-1781303549/`.
8. Create marker `READY_FOR_REVIEW` (directory or empty file) in the contour directory.

## Tests

Run these focused commands:

```bash
cd /opt/processmap-test
git diff --check
node --check frontend/src/features/process/stage/presence/useSessionPresence.js
node --check frontend/src/features/process/stage/presence/useSessionPresence.test.mjs
cd frontend && node --test src/features/process/stage/presence/useSessionPresence.test.mjs
```

If the last command fails due to the Node 18 / jsdom 28 ESM loader error (`ERR_REQUIRE_ESM` from `html-encoding-sniffer`), record the exact error in `EXEC_REPORT.md`. This environment issue is out of scope for this contour.

## Runtime Proof

No runtime proof required. Include the test command output in `EXEC_REPORT.md`.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth
- Files changed
- Validation run (command output)
- Runtime proof status
- Explicit unchanged areas
- Remaining risks
