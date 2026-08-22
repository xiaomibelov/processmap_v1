# Plan: stage4/test-timeout-1781303549

## Goal

Eliminate the test-timeout failures in `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs` caused by tests waiting 12+ seconds because `useSessionPresence.js` clamps `heartbeatMs` to a minimum of 5000 ms.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch: `analitics/analytics_work`
- HEAD: `1fb821cb99207c12c59eb1aab05f30d02eae7730`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status: dirty; `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs` already has uncommitted test additions.
- Obsidian scan: no relevant `EPIC BOARD`/`ACTIVE TASKS` notes found in `PROCESSMAP/`.

## GSD Local Sources

- Templates read: `.planning/templates/PLAN.template.md`, `EXECUTOR_PROMPT.template.md`, `REVIEWER_PROMPT.template.md`, `STATE.template.json`.
- Local skill context: `processmap-agent` (Agent 1 Planner), AGENTS.md §3 source truth, §6 bounded contour rules.
- RAG query attempted; returned `invalid_user` — no prior RAG context injected.

## Scope

Allowed files:
- `frontend/src/features/process/stage/presence/useSessionPresence.js`
- `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`

## Non-goals

- Product frontend/backend code outside the two files above.
- DB/schema changes.
- BPMN XML save behavior.
- AI/RAG/Product Actions logic.
- PR, merge, or deploy.
- Fixing the unrelated Node 18 / jsdom 28 ESM loader error that currently prevents `node --test` from executing this file in the local environment.

## Implementation Steps

1. Capture source truth (already done; Worker must re-verify before editing).
2. In `useSessionPresence.js`, remove the `Math.max(5000, ...)` clamp on `options.heartbeatMs` so that an explicit finite positive value is honored. The default `SESSION_PRESENCE_HEARTBEAT_MS` (45000 ms) must remain unchanged when no explicit value is supplied.
3. In `useSessionPresence.test.mjs`, update the slow tests that relied on the 5000 ms clamp:
   - Reduce real-time waits to sub-second values consistent with the requested `heartbeatMs`.
   - Update expected heartbeat call counts proportionally.
   - Remove or update comments that describe the 5000 ms clamp.
4. Run `git diff --check` and targeted syntax checks.
5. Attempt to run the test file. If it still fails because of the pre-existing Node 18 / jsdom ESM loader issue, document the failure and the fact that the timeout-specific waits were reduced.
6. Write `EXEC_REPORT.md` in this contour directory and create the `READY_FOR_REVIEW` marker.

## Validation

- `git diff --check`
- `node --check frontend/src/features/process/stage/presence/useSessionPresence.js`
- `node --check frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`
- `cd frontend && node --test src/features/process/stage/presence/useSessionPresence.test.mjs` (best-effort; environment limitation noted above)
- Diff guard: only the two scoped files may change.

## Runtime Proof

Runtime proof: not applicable. This is a unit-test / hook timing fix; no browser/runtime navigation is required.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- `git diff`
- Validation output
