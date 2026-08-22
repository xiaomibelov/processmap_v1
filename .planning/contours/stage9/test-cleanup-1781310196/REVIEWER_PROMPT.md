# Reviewer Prompt: stage9/test-cleanup-1781310196

## Goal

Peer review the verification contour using `PLAN.md`, `EXEC_REPORT.md`, the test harness output, and the cleanup log tail.

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
- `.agents/bin/cleanup.sh`
- `.agents/tests/test_stage9_cleanup.sh`
- `/var/log/processmap-cleanup.log` tail (last 20 lines)

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The execution matches `PLAN.md`.
2. The current branch is `test/stage9-cleanup-1781310196`.
3. No product source code was changed (`git diff --name-only` is empty).
4. No unrelated files are staged or committed.
5. No merge, rebase, push, PR, deploy, or release artifacts are present.
6. `.agents/tests/test_stage9_cleanup.sh` was run and exited 0.
7. All 9 assertions in the test harness passed:
   - old REVIEW_PASS contour (>7 days) removed
   - old non-pass contour (>30 days) removed
   - old run-state dir (>30 days) removed
   - recent REVIEW_PASS contour (<=7 days) preserved
   - recent non-pass contour (<=30 days) preserved
   - new REVIEW_PASS contour preserved
   - new non-pass contour preserved
   - recent run-state dir (<=30 days) preserved
   - new run-state dir preserved
8. `/var/log/processmap-cleanup.log` contains a "Starting cleanup" and "Cleanup done" entry for the run.
9. No unintended directories under `.planning/contours/` or `.agents/run-state/` were removed.
10. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage9/test-cleanup-1781310196/`.

If acceptable:

```bash
touch .planning/contours/stage9/test-cleanup-1781310196/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage9/test-cleanup-1781310196/CHANGES_REQUESTED
```

Never create both markers.
