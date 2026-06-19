# Reviewer Prompt: stage7/test-maxtime-1781307868

## Goal

Peer review the test contour using `PLAN.md`, `EXEC_REPORT.md`, the diff, and the test output.

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
git show --stat HEAD
```

## Review Scope

Read:

- `PLAN.md`
- `EXEC_REPORT.md`
- This `REVIEWER_PROMPT.md`
- The changed files:
  - `tools/agent-ui/lib/checkTotalTime.js`
  - `tools/agent-ui/lib/checkTotalTime.test.js`
  - `tools/agent-ui/server.js`
- Test command output referenced in `EXEC_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The implementation matches `PLAN.md`.
2. The current branch is `test/agent-max-total-time`.
3. `HEAD` is exactly one commit ahead of `origin/main`.
4. The latest commit contains only the three scoped files:
   - `tools/agent-ui/lib/checkTotalTime.js`
   - `tools/agent-ui/lib/checkTotalTime.test.js`
   - `tools/agent-ui/server.js`
5. The commit message follows conventional-commit style and describes the change accurately.
6. No other product source code was changed.
7. No unrelated files are staged or committed.
8. No merge, rebase, push, PR, deploy, or release artifacts are present.
9. Validation commands were run and produced clean output:
   - `node --check` passes for all three files.
   - `node --test tools/agent-ui/lib/checkTotalTime.test.js` passes.
   - `.agents/tests/test_stage7_max_total_time.sh` exits 0 and prints `PASS`.
10. The unit tests cover the cases listed in `PLAN.md`:
    - elapsed < limit → not exceeded
    - elapsed > limit → exceeded
    - elapsed == limit → not exceeded
    - default 1-hour limit when `maxTotalTime` is missing
    - custom `maxTotalTime` honored
    - `startedAt` null → `true`
    - `startedAt` undefined → `false`
11. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage7/test-maxtime-1781307868/`.

If acceptable:

```bash
touch .planning/contours/stage7/test-maxtime-1781307868/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage7/test-maxtime-1781307868/CHANGES_REQUESTED
```

Never create both markers.
