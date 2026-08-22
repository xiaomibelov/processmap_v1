# Plan: stage10/test-metrics-20260613-004203

## Goal

Verify that the agent-scheduler health endpoint at `http://91.184.252.237:3456/health` returns the expected metrics fields and that the local metrics log `.agents/metrics.log` exists, matching the assertions encoded in `.agents/tests/test_stage10_health.sh`.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch (at planning time): `test/stage9-cleanup-1781310196`
- HEAD: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status at planning time: clean except for pre-existing unrelated untracked files (`.planning/contours/stage[1-9]/`, `.worktrees/`)

## GSD Local Sources

- Health test harness: `.agents/tests/test_stage10_health.sh`
- Metrics log: `.agents/metrics.log`
- Scheduler implementation: `tools/agent-ui/server.js`
- AGENTS.md §2 (branch isolation), §3 (source truth), §6 (bounded contour / no mixing)

## Scope

Allowed operations:

- Create a new branch `test/stage10-test-metrics-20260613-004203` from `origin/main`.
- Read `.agents/tests/test_stage10_health.sh`.
- Read `tools/agent-ui/server.js` (optional, for context).
- Call `http://91.184.252.237:3456/health` via `curl`.
- Run `.agents/tests/test_stage10_health.sh`.
- Inspect `.agents/metrics.log`.
- Write `EXEC_REPORT.md` in this contour directory.

Allowed changes: none to product source code. This is a verification-only contour.

## Non-goals

- No edits to product frontend/backend/agent-ui code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation beyond the single HTTP health call.

## Implementation Steps

1. Capture source truth (commands in `WORKER_PROMPT.md`).
2. Create and check out a new branch `test/stage10-test-metrics-20260613-004203` from `origin/main`.
3. Verify `.agents/tests/test_stage10_health.sh` exists and is executable.
4. Read the test harness to confirm the expected health fields (`queue`, `active`, `maxConcurrent`, `lastAgentTimeout`, `diskFreeGb`) and the metrics log path.
5. Run `.agents/tests/test_stage10_health.sh`.
6. If the health endpoint is unreachable, diagnose with a direct `curl` call and record the raw response or error in `EXEC_REPORT.md`.
7. Verify `.agents/metrics.log` exists and contains at least one JSON line with `event` and `runId` fields.
8. Run `git diff --check` and `git diff --name-only` to confirm no product files changed.
9. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` reports no whitespace errors.
- `git diff --name-only` returns nothing (no product code changed).
- `.agents/tests/test_stage10_health.sh` exits 0 and prints `STAGE 10 HEALTH TEST PASSED`.
- The health endpoint JSON response contains all five required fields:
  - `queue`
  - `active`
  - `maxConcurrent`
  - `lastAgentTimeout`
  - `diskFreeGb`
- `.agents/metrics.log` exists and is non-empty.
- `.agents/metrics.log` contains at least one valid JSON line with `event` and `runId`.

## Runtime Proof

Runtime proof: a single HTTP GET to `http://91.184.252.237:3456/health`. The worker must include the raw response, the test harness output, and the metrics log tail in `EXEC_REPORT.md`.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- Test command outputs
- Health endpoint raw response
- `.agents/metrics.log` tail
