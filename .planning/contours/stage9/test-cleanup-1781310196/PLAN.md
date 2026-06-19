# Plan: stage9/test-cleanup-1781310196

## Goal

Verify that `.agents/bin/cleanup.sh` correctly deletes old contour and run-state directories while preserving recent ones, matching the retention rules encoded in `.agents/tests/test_stage9_cleanup.sh`.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch (at planning time): `test/agent-max-total-time`
- HEAD: `48f2950b8e2049797489f83c96b4af05b4323b1a`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status at planning time: clean except for pre-existing unrelated untracked files (`.planning/contours/stage[1-8]/`, `.worktrees/`)

## GSD Local Sources

- Cleanup script: `.agents/bin/cleanup.sh`
- Test harness: `.agents/tests/test_stage9_cleanup.sh`
- API scheduler wrapper: `.agents/tests/stage9_api_test.sh`
- AGENTS.md §2 (branch isolation), §3 (source truth), §6 (bounded contour / no mixing)

## Scope

Allowed operations:
- Create a new branch `test/stage9-cleanup-1781310196` from `origin/main`.
- Read `.agents/bin/cleanup.sh` and `.agents/tests/test_stage9_cleanup.sh`.
- Run `.agents/tests/test_stage9_cleanup.sh`.
- Inspect `/var/log/processmap-cleanup.log` after the run.
- Write `EXEC_REPORT.md` in this contour directory.

Allowed changes: none to product source code. This is a verification-only contour.

## Non-goals

- No edits to product frontend/backend/agent-ui code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation (this is a server-side bash verification).

## Implementation Steps

1. Capture source truth (commands in `WORKER_PROMPT.md`).
2. Create and check out a new branch `test/stage9-cleanup-1781310196` from `origin/main`.
3. Verify `.agents/bin/cleanup.sh` exists and is executable.
4. Verify `.agents/tests/test_stage9_cleanup.sh` exists and is executable.
5. Run `.agents/tests/test_stage9_cleanup.sh`.
6. Inspect `/var/log/processmap-cleanup.log` to confirm the script logged start and done.
7. Verify no unintended directories under `.planning/contours/` or `.agents/run-state/` were removed (only the test fixtures created by the harness).
8. Run `git diff --check` and `git diff --name-only` to confirm no product files changed.
9. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` reports no whitespace errors.
- `git diff --name-only` returns nothing (no product code changed).
- `.agents/tests/test_stage9_cleanup.sh` exits 0 and prints only `PASS` lines.
- All 9 assertions in the test harness pass:
  - old REVIEW_PASS contour (>7 days) removed
  - old non-pass contour (>30 days) removed
  - old run-state dir (>30 days) removed
  - recent REVIEW_PASS contour (<=7 days) preserved
  - recent non-pass contour (<=30 days) preserved
  - new REVIEW_PASS contour preserved
  - new non-pass contour preserved
  - recent run-state dir (<=30 days) preserved
  - new run-state dir preserved
- `/var/log/processmap-cleanup.log` contains a "Starting cleanup" and "Cleanup done" entry for the run.

## Runtime Proof

Runtime proof: not applicable for browser/UI navigation. This contour runs a bash test harness and inspects a log file. The worker must include the test command outputs and log tail in `EXEC_REPORT.md`.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- Test command outputs
- `/var/log/processmap-cleanup.log` tail
