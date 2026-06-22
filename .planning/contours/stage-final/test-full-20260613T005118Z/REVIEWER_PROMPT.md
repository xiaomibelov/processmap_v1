# Reviewer Prompt: stage-final/test-full-20260613T005118Z

## Goal

Peer review the verification contour using `PLAN.md`, `EXEC_REPORT.md`, the ten stage test harness outputs, the health endpoint raw response, and the metrics log tail.

## Source Truth Commands

Run before review:

```bash
cd /opt/processmap-test
git fetch origin
pwd
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git status -sb
git diff --name-only
git diff --check
git log --oneline -5
```

## Review Scope

Read:

- `PLAN.md`
- `EXEC_REPORT.md`
- This `REVIEWER_PROMPT.md`
- The ten test harness files (as needed to confirm assertions)
- `.agents/metrics.log` tail (last 10 lines)

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The execution matches `PLAN.md`.
2. The current branch is `test/stage-final-test-full-20260613T005118Z`.
3. No product source code was changed (`git diff --name-only` is empty).
4. No unrelated files are staged or committed.
5. No merge, rebase, push, PR, deploy, or release artifacts are present.
6. All ten stage harnesses were run and each exited 0:
   - `test_stage1_paths.sh`
   - `test_stage2_atomic_markers.sh`
   - `test_stage3_heartbeat.sh`
   - `test_stage4_timeout.sh`
   - `test_stage5_git_backup.sh`
   - `test_stage6_versioning.sh`
   - `test_stage7_max_total_time.sh`
   - `test_stage8_dev_server.sh`
   - `test_stage9_cleanup.sh`
   - `test_stage10_health.sh`
7. The health endpoint raw response contains all five required fields:
   - `queue`
   - `active`
   - `maxConcurrent`
   - `lastAgentTimeout`
   - `diskFreeGb`
8. `.agents/metrics.log` exists and is non-empty.
9. `.agents/metrics.log` contains at least one valid JSON line with `event` and `runId`.
10. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage-final/test-full-20260613T005118Z/`.

If acceptable:

```bash
touch .planning/contours/stage-final/test-full-20260613T005118Z/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage-final/test-full-20260613T005118Z/CHANGES_REQUESTED
```

Never create both markers.
