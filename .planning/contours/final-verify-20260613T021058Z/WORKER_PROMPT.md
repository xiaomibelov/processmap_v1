# Worker Prompt: final-verify-20260613T021058Z

## Goal

Deliver the bounded verification contour exactly as described in `PLAN.md`: verify the staged agent-pipeline test suite (stages 1–10) and the `stage-final/test-full-20260613T005118Z` integration contour, confirm scheduler health, confirm `.agents/metrics.log` is coherent, and report the result. Do not edit product code, merge, push, or create a PR.

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

The current branch at planning time is `test/stage-final-test-full-20260613T005118Z`. Create a clean branch for this contour. If unrelated dirty files block the contour, stop and record the blocker in `EXEC_REPORT.md`.

## GSD Local Requirement

Use only local bash and safe git CLI commands. Record every command and its outcome in `EXEC_REPORT.md`. No external runners are required.

## Scope

Read `PLAN.md`. Touch no product source files. Only inspect:

- `.planning/contours/stage[1-10]/*/`
- `.planning/contours/stage-final/test-full-20260613T005118Z/`
- `.agents/tests/test_stage*.sh`
- `http://91.184.252.237:3456/health` (via `curl`)
- `.agents/metrics.log`
- Optionally `http://localhost:5177/` (dev server freshness)

Create and use this branch:

```bash
git checkout -b test/final-verify-20260613T021058Z origin/main
```

## Non-goals

- No edits to product frontend/backend/agent-ui code.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files (`.planning/contours/stage*/`, `.worktrees/`, IDE/agent config directories).
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation beyond the single HTTP health call and optional dev-server probe.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Create and check out the branch:
   ```bash
   git checkout -b test/final-verify-20260613T021058Z origin/main
   ```
4. Inventory the prior stage contours. Use a helper script like:
   ```bash
   cd /opt/processmap-test
   ROOT=".planning/contours"
   echo "| Stage | Contour | PLAN | WORKER_PROMPT | REVIEWER_PROMPT | WORKER_REPORT/EXEC_REPORT | REVIEW_REPORT | REVIEW_PASS | CHANGES_REQUESTED | BLOCKED |"
   echo "|-------|---------|------|---------------|-----------------|---------------------------|---------------|-------------|-------------------|---------|"
   for stage in stage1 stage2 stage3 stage4 stage5 stage6 stage7 stage8 stage9 stage10 stage-final; do
     dir="$ROOT/$stage"
     if [ -d "$dir" ]; then
       # pick the only/newest subdirectory
       contour=$(find "$dir" -mindepth 1 -maxdepth 1 -type d | sort | tail -n1)
       if [ -n "$contour" ]; then
         cid="${contour#$ROOT/}"
         [ -f "$contour/PLAN.md" ] && plan="Y" || plan="N"
         [ -f "$contour/WORKER_PROMPT.md" ] && wp="Y" || wp="N"
         [ -f "$contour/REVIEWER_PROMPT.md" ] && rp="Y" || rp="N"
         [ -f "$contour/WORKER_REPORT.md" ] || [ -f "$contour/EXEC_REPORT.md" ] && wr="Y" || wr="N"
         [ -f "$contour/REVIEW_REPORT.md" ] && rr="Y" || rr="N"
         [ -e "$contour/REVIEW_PASS" ] && rpass="Y" || rpass="N"
         [ -e "$contour/CHANGES_REQUESTED" ] && cr="Y" || cr="N"
         [ -e "$contour/EXEC_BLOCKED.md" ] || [ -e "$contour/REVIEW_BLOCKED.md" ] && blocked="Y" || blocked="N"
         echo "| $stage | $cid | $plan | $wp | $rp | $wr | $rr | $rpass | $cr | $blocked |"
       fi
     fi
   done
   ```
5. Read `stage-final/test-full-20260613T005118Z/EXEC_REPORT.md` and confirm it reports all ten stage harnesses PASS. Record the verdict from `stage-final/test-full-20260613T005118Z/REVIEW_REPORT.md`.
6. Optionally reproduce the ten harness results:
   ```bash
   cd /opt/processmap-test
   for script in .agents/tests/test_stage{1..10}_*.sh; do
     echo "=== Running $script ==="
     bash "$script" && echo "PASS: $script" || echo "FAIL: $script (exit $?)"
   done
   ```
7. Perform a direct health endpoint probe:
   ```bash
   curl -s --max-time 10 "http://91.184.252.237:3456/health"
   ```
   Record the raw JSON response in `EXEC_REPORT.md`.
8. Inspect the metrics log:
   ```bash
   wc -l /opt/processmap-test/.agents/metrics.log
   tail -n 15 /opt/processmap-test/.agents/metrics.log
   ```
   Verify every line is valid JSON and contains `event` and `runId`:
   ```bash
   python3 -c "
   import json
   path = '/opt/processmap-test/.agents/metrics.log'
   ok = True
   with open(path) as f:
       for i, line in enumerate(f, 1):
           line = line.strip()
           if not line:
               continue
           try:
               obj = json.loads(line)
           except Exception as e:
               print(f'JSON_ERR line {i}: {e}')
               ok = False
               continue
           if 'event' not in obj or 'runId' not in obj:
               print(f'FIELD_ERR line {i}: missing event/runId')
               ok = False
   print('JSON_OK' if ok else 'JSON_HAS_ERRORS')
   "
   ```
9. Verify the diff:
   ```bash
   git diff --check
   git diff --name-only
   ```
   Expected: empty (no product code changed).
10. Optionally verify dev server freshness:
    ```bash
    curl -sI --max-time 5 "http://localhost:5177/" | head -n 5
    ```
11. Write `EXEC_REPORT.md` in `.planning/contours/final-verify-20260613T021058Z/`.
12. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Run the validation commands listed in `PLAN.md` and above. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

No browser/UI runtime proof required. Include in `EXEC_REPORT.md`:

- The inventory table of stage1–stage10 and stage-final artifacts/markers.
- The `stage-final` EXEC_REPORT verdict summary.
- The health endpoint raw response.
- The metrics log tail and JSON validity confirmation.
- Git status and diff output proving no product changes.
- Optional dev-server probe result.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Files changed (expected: none)
- Stage contour inventory table
- `stage-final` verdict summary
- Optional reproduced harness results
- Health endpoint raw response
- Validation command output
- Metrics log tail and JSON validity status
- Runtime proof status
- Explicit unchanged areas
- Remaining risks

## Dev Server Requirement

If you run the optional dev-server probe, ensure the server on `:5177` is reachable. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, note it in `EXEC_REPORT.md` but do not modify product code to fix it.
