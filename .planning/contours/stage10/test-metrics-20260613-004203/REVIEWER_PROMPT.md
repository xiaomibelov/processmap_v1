# Reviewer Prompt: stage10/test-metrics-20260613-004203

## Goal

Peer review the verification contour using `PLAN.md`, `EXEC_REPORT.md`, the test harness output, the health endpoint raw response, and the metrics log tail.

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
- `.agents/tests/test_stage10_health.sh`
- `.agents/metrics.log` tail (last 10 lines)

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The execution matches `PLAN.md`.
2. The current branch is `test/stage10-test-metrics-20260613-004203`.
3. No product source code was changed (`git diff --name-only` is empty).
4. No unrelated files are staged or committed.
5. No merge, rebase, push, PR, deploy, or release artifacts are present.
6. `.agents/tests/test_stage10_health.sh` was run and exited 0.
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

Write `REVIEW_REPORT.md` in `.planning/contours/stage10/test-metrics-20260613-004203/`.

If acceptable:

```bash
touch .planning/contours/stage10/test-metrics-20260613-004203/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage10/test-metrics-20260613-004203/CHANGES_REQUESTED
```

Never create both markers.
