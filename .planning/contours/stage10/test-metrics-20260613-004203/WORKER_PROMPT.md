# Worker Prompt: stage10/test-metrics-20260613-004203

## Goal

Deliver the bounded verification contour exactly as described in `PLAN.md`: call the agent-scheduler health endpoint, run `.agents/tests/test_stage10_health.sh`, confirm the expected metrics fields are present, confirm `.agents/metrics.log` exists and is valid, and report the result. Do not edit product code, merge, push, or create a PR.

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

The current branch at planning time is `test/stage9-cleanup-1781310196` (stage9). Create a clean branch for this contour. If unrelated dirty files block the contour, stop and record the blocker in `EXEC_REPORT.md`.

## GSD Local Requirement

Use only local bash and safe git CLI commands. Record every command and its outcome in `EXEC_REPORT.md`. No external runners are required.

## Scope

Read `PLAN.md`. Touch no product source files. Only inspect and run:

- `.agents/tests/test_stage10_health.sh`
- `http://91.184.252.237:3456/health` (via `curl`)
- `.agents/metrics.log`

Create and use this branch:

```bash
git checkout -b test/stage10-test-metrics-20260613-004203 origin/main
```

## Non-goals

- No edits to product frontend/backend/agent-ui code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files (`.planning/contours/stage[1-9]/`, `.worktrees/`).
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation beyond the single HTTP health call.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Create and check out the branch:
   ```bash
   git checkout -b test/stage10-test-metrics-20260613-004203 origin/main
   ```
4. Verify the test harness exists and is executable:
   ```bash
   test -x /opt/processmap-test/.agents/tests/test_stage10_health.sh
   ```
5. Record the test harness content in `EXEC_REPORT.md` (or a summary).
6. Perform a direct health endpoint probe:
   ```bash
   curl -s --max-time 10 "http://91.184.252.237:3456/health"
   ```
   Record the raw JSON response in `EXEC_REPORT.md`.
7. Run the test harness:
   ```bash
   cd /opt/processmap-test
   .agents/tests/test_stage10_health.sh
   ```
8. Inspect the metrics log:
   ```bash
   wc -l /opt/processmap-test/.agents/metrics.log
   tail -n 5 /opt/processmap-test/.agents/metrics.log
   ```
   Verify at least one line is valid JSON containing `event` and `runId`:
   ```bash
   python3 -c "import json,sys; [json.loads(l) for l in open('/opt/processmap-test/.agents/metrics.log')]; print('JSON_OK')"
   ```
9. Verify the diff:
   ```bash
   git diff --check
   git diff --name-only
   ```
   Expected: empty (no product code changed).
10. Write `EXEC_REPORT.md` in `.planning/contours/stage10/test-metrics-20260613-004203/`.
11. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Run the validation commands listed in `PLAN.md` and above. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

No browser/UI runtime proof required. Include the health endpoint raw response, test harness output, metrics log tail, and git status/log output in `EXEC_REPORT.md`.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Files changed (expected: none)
- Health endpoint raw response
- Validation command output
- Metrics log tail and JSON validity status
- Runtime proof status
- Explicit unchanged areas
- Remaining risks

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
