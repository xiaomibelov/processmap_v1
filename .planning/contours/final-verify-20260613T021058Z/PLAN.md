# Plan: final-verify-20260613T021058Z

## Goal

Perform a read-only final verification of the staged agent-pipeline test suite (stages 1–10) and the preceding `stage-final/test-full-20260613T005118Z` integration contour. Confirm that every stage contour has the expected planning/execution/review artifacts, that the `stage-final` harness report is consistent, that the scheduler health endpoint is healthy, and that `.agents/metrics.log` records a coherent run/review history. This is a verification-only contour: no product code is changed.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch (at planning time): `test/stage-final-test-full-20260613T005118Z`
- HEAD: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status at planning time: clean of tracked changes; pre-existing untracked planning/agent/tooling artifacts (`.planning/contours/stage*/`, `.planning/contours/stage-final/`, `.worktrees/`, various `.*/` IDE/agent config directories)
- Active scheduler run for this contour: `wf-1781316659010-lbze` (per `.agents/metrics.log`)

## GSD Local Sources

- Prior stage contour directories: `.planning/contours/stage[1-10]/`
- Final integration contour: `.planning/contours/stage-final/test-full-20260613T005118Z/`
- Stage test harnesses: `.agents/tests/test_stage1_paths.sh` through `.agents/tests/test_stage10_health.sh`
- Scheduler health endpoint: `http://91.184.252.237:3456/health`
- Metrics log: `.agents/metrics.log`
- AGENTS.md §2 (branch isolation), §3 (source truth), §6 (bounded contour / no mixing)

## Scope

Allowed operations:

- Create a verification branch `test/final-verify-20260613T021058Z` from `origin/main`.
- Read the prior stage contour directories and `stage-final` execution/review reports.
- Inventory required files and outcome markers (`REVIEW_PASS`, `CHANGES_REQUESTED`, `EXEC_BLOCKED.md`, `REVIEW_BLOCKED.md`).
- Run the ten stage harnesses if needed to reproduce the `stage-final` evidence (optional; the `stage-final/EXEC_REPORT.md` is the primary evidence).
- Call `http://91.184.252.237:3456/health` via `curl`.
- Inspect `.agents/metrics.log` for JSON validity, required fields, and run/review event pairs.
- Optionally verify the dev server on `http://localhost:5177/` is reachable and fresh.
- Write `EXEC_REPORT.md` in this contour directory.

Allowed changes: none to product source code. Only contour artifacts (`PLAN.md`, `WORKER_PROMPT.md`, `REVIEWER_PROMPT.md`, `EXEC_REPORT.md`, markers) may be created or updated.

## Non-goals

- No edits to product frontend/backend/agent-ui code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation beyond the single HTTP health call and optional dev-server freshness probe.

## Implementation Steps

1. Capture source truth (commands in `WORKER_PROMPT.md`).
2. Create and check out a new branch `test/final-verify-20260613T021058Z` from `origin/main`.
3. Inventory the prior stage contours:
   - For each `stage1` through `stage10`, list the newest contour subdirectory.
   - Check presence of `PLAN.md`, `WORKER_PROMPT.md`, `REVIEWER_PROMPT.md`, `WORKER_REPORT.md` (or `EXEC_REPORT.md`), `REVIEW_REPORT.md`.
   - Record outcome markers: `REVIEW_PASS`, `CHANGES_REQUESTED`, `EXEC_BLOCKED.md`, `REVIEW_BLOCKED.md`.
4. Read `stage-final/test-full-20260613T005118Z/EXEC_REPORT.md` and `REVIEW_REPORT.md`; confirm all ten harnesses are reported PASS and the review verdict is PASS.
5. Run a fresh health endpoint probe to `http://91.184.252.237:3456/health` and validate the five required fields.
6. Inspect `.agents/metrics.log`:
   - Line count and tail.
   - JSON validity of every line.
   - Presence of `event` and `runId` on every line.
   - Presence of `run_start` and `review_pass` events for each completed contour (stages and `stage-final`), and the current `run_start` for `final-verify-20260613T021058Z`.
7. Run `git diff --check` and `git diff --name-only` to confirm no product files changed.
8. Optionally probe `http://localhost:5177/` and record the status line and `Date` header.
9. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` reports no whitespace errors.
- `git diff --name-only` returns nothing (no product code changed).
- The health endpoint JSON response contains all five required fields:
  - `queue`
  - `active`
  - `maxConcurrent`
  - `lastAgentTimeout`
  - `diskFreeGb`
- `.agents/metrics.log` exists, is non-empty, and every line is valid JSON containing `event` and `runId`.
- `stage-final/EXEC_REPORT.md` reports all ten stage harnesses PASS.
- Each prior stage contour has at least `PLAN.md`, `WORKER_PROMPT.md`, and `REVIEWER_PROMPT.md`.
- Outcome markers are recorded consistently (e.g., `REVIEW_PASS` for passing contours, `EXEC_BLOCKED.md`/`REVIEW_BLOCKED.md` only for contours already known to be blocked).

## Runtime Proof

Runtime proof: the inventory table of prior stage contour artifacts/markers, the raw HTTP GET response from `http://91.184.252.237:3456/health`, the tail of `.agents/metrics.log`, the JSON validity check output, and the git status/diff output. The worker must include all of these in `EXEC_REPORT.md`.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- Inventory table of stage1–stage10 + stage-final artifacts
- Health endpoint raw response
- `.agents/metrics.log` tail and JSON validity result
