# Reviewer Prompt: final-verify-20260613T021058Z

## Goal

Peer review the verification contour using `PLAN.md`, `EXEC_REPORT.md`, the prior stage contour artifacts, the health endpoint raw response, and the metrics log tail.

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
- The prior stage contour directories as needed to confirm the inventory table
- `.agents/metrics.log` tail (last 15 lines)
- `stage-final/test-full-20260613T005118Z/EXEC_REPORT.md` and `REVIEW_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The execution matches `PLAN.md`.
2. The current branch is `test/final-verify-20260613T021058Z`.
3. No product source code was changed (`git diff --name-only` is empty).
4. No unrelated files are staged or committed.
5. No merge, rebase, push, PR, deploy, or release artifacts are present.
6. The stage contour inventory table in `EXEC_REPORT.md` accurately reflects the filesystem.
7. `stage-final/test-full-20260613T005118Z/EXEC_REPORT.md` reports all ten stage harnesses PASS, and `REVIEW_REPORT.md` verdict is PASS.
8. The health endpoint raw response contains all five required fields:
   - `queue`
   - `active`
   - `maxConcurrent`
   - `lastAgentTimeout`
   - `diskFreeGb`
9. `.agents/metrics.log` exists and is non-empty.
10. `.agents/metrics.log` contains only valid JSON lines, each with `event` and `runId`.
11. The metrics log records `run_start` and `review_pass` pairs for the completed stage/stage-final contours, plus the current `run_start` for `final-verify-20260613T021058Z`.
12. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/final-verify-20260613T021058Z/`.

If acceptable:

```bash
touch .planning/contours/final-verify-20260613T021058Z/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/final-verify-20260613T021058Z/CHANGES_REQUESTED
```

Never create both markers.
