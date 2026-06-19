# Plan: stage-final/test-full-20260613T005118Z

## Goal

Run the complete staged agent-pipeline test suite (stages 1–10) in a single bounded verification contour, confirm the scheduler health endpoint returns the expected metrics, and confirm the metrics log is healthy. This is the final integration check after the individual stage contours.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch (at planning time): `test/stage10-test-metrics-20260613-004203`
- HEAD: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status at planning time: clean except for pre-existing unrelated untracked files (`.planning/contours/stage[1-10]/`, `.worktrees/`)

## GSD Local Sources

- Stage test harnesses: `.agents/tests/test_stage1_paths.sh` through `.agents/tests/test_stage10_health.sh`
- Scheduler implementation / health endpoint: `tools/agent-ui/server.js` → `http://91.184.252.237:3456/health`
- Metrics log: `.agents/metrics.log`
- AGENTS.md §2 (branch isolation), §3 (source truth), §6 (bounded contour / no mixing)

## Scope

Allowed operations:

- Create a new branch `test/stage-final-test-full-20260613T005118Z` from `origin/main`.
- Read each `.agents/tests/test_stage*.sh` harness for context.
- Run all ten stage test harnesses in order.
- Call `http://91.184.252.237:3456/health` via `curl`.
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
2. Create and check out a new branch `test/stage-final-test-full-20260613T005118Z` from `origin/main`.
3. Verify all ten test harnesses exist and are executable.
4. Run the full suite in order:
   - `.agents/tests/test_stage1_paths.sh`
   - `.agents/tests/test_stage2_atomic_markers.sh`
   - `.agents/tests/test_stage3_heartbeat.sh`
   - `.agents/tests/test_stage4_timeout.sh`
   - `.agents/tests/test_stage5_git_backup.sh`
   - `.agents/tests/test_stage6_versioning.sh`
   - `.agents/tests/test_stage7_max_total_time.sh`
   - `.agents/tests/test_stage8_dev_server.sh`
   - `.agents/tests/test_stage9_cleanup.sh`
   - `.agents/tests/test_stage10_health.sh`
5. Perform a direct health endpoint probe to `http://91.184.252.237:3456/health`.
6. Inspect `.agents/metrics.log`: line count, tail, and JSON validity with `event`/`runId` fields.
7. Run `git diff --check` and `git diff --name-only` to confirm no product files changed.
8. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` reports no whitespace errors.
- `git diff --name-only` returns nothing (no product code changed).
- Each stage harness exits 0 and prints its expected `PASS` message.
- The health endpoint JSON response contains all five required fields:
  - `queue`
  - `active`
  - `maxConcurrent`
  - `lastAgentTimeout`
  - `diskFreeGb`
- `.agents/metrics.log` exists and is non-empty.
- `.agents/metrics.log` contains at least one valid JSON line with `event` and `runId`.

## Runtime Proof

Runtime proof: the collective output of the ten stage harnesses, the raw HTTP GET response from `http://91.184.252.237:3456/health`, and the tail of `.agents/metrics.log`. The worker must include all of these in `EXEC_REPORT.md`.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- Ten test harness outputs
- Health endpoint raw response
- `.agents/metrics.log` tail
