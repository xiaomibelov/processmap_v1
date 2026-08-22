# Worker Prompt: stage9/test-cleanup-1781310196

## Goal

Deliver the bounded verification contour exactly as described in `PLAN.md`: run `.agents/tests/test_stage9_cleanup.sh`, confirm `.agents/bin/cleanup.sh` enforces the correct retention rules, and report the result. Do not edit product code, merge, push, or create a PR.

## Source Truth Commands

Run before any git or test operation:

```bash
cd /opt/processmap-test
git fetch origin
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

The current branch at planning time is `test/agent-max-total-time` (stage7). Create a clean branch for this contour. If unrelated dirty files block the contour, stop and record the blocker in `EXEC_REPORT.md`.

## GSD Local Requirement

Use only local bash and safe git CLI commands. Record every command and its outcome in `EXEC_REPORT.md`. No external runners are required.

## Scope

Read `PLAN.md`. Touch no product source files. Only inspect and run:

- `.agents/bin/cleanup.sh`
- `.agents/tests/test_stage9_cleanup.sh`
- `/var/log/processmap-cleanup.log`

Create and use this branch:

```bash
git checkout -b test/stage9-cleanup-1781310196 origin/main
```

## Non-goals

- No edits to product frontend/backend/agent-ui code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files (`.planning/contours/stage[1-8]/`, `.worktrees/`).
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Create and check out the branch:
   ```bash
   git checkout -b test/stage9-cleanup-1781310196 origin/main
   ```
4. Verify the cleanup script and test harness exist and are executable:
   ```bash
   test -x /opt/processmap-test/.agents/bin/cleanup.sh
   test -x /opt/processmap-test/.agents/tests/test_stage9_cleanup.sh
   ```
5. Record the cleanup script content in `EXEC_REPORT.md` (or a summary).
6. Run the test harness:
   ```bash
   cd /opt/processmap-test
   .agents/tests/test_stage9_cleanup.sh
   ```
7. Inspect the cleanup log:
   ```bash
   tail -n 20 /var/log/processmap-cleanup.log
   ```
8. Verify no unexpected contour or run-state directories were removed. List surviving test fixtures before the harness removes them, or verify by name after the run.
9. Verify the diff:
   ```bash
   git diff --check
   git diff --name-only
   ```
   Expected: empty (no product code changed).
10. Write `EXEC_REPORT.md` in `.planning/contours/stage9/test-cleanup-1781310196/`.
11. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Run the validation commands listed in `PLAN.md` and above. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

No browser/UI runtime proof required. Include test command output, log tail, and git status/log output in `EXEC_REPORT.md`.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Files changed (expected: none)
- Validation command output
- Runtime proof status
- Explicit unchanged areas
- Remaining risks

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
