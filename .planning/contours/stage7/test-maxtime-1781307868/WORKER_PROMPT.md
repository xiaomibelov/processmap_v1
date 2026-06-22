# Worker Prompt: stage7/test-maxtime-1781307868

## Goal

Deliver the bounded contour exactly as described in `PLAN.md`: extract the `_checkTotalTime` predicate from `tools/agent-ui/server.js` into a testable module, add deterministic unit tests, and verify the existing stage-7 simulation passes. Do not edit other product code, merge, push, or create a PR.

## Source Truth Commands

Run before any git or edit operation:

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

The current branch at planning time is `test/versioning-edge-cases` (stage6's branch). Create a clean branch for this contour. If unrelated dirty files block the contour, stop and record the blocker in `EXEC_REPORT.md`.

## GSD Local Requirement

Use only local Node.js test runner and safe git CLI commands. Record every command and its outcome in `EXEC_REPORT.md`. No external runners are required.

## Scope

Read `PLAN.md`. Touch only these files:

- `tools/agent-ui/lib/checkTotalTime.js` (new)
- `tools/agent-ui/lib/checkTotalTime.test.js` (new)
- `tools/agent-ui/server.js` (import + delegate to extracted predicate)

Create and use this branch:

```bash
git checkout -b test/agent-max-total-time origin/main
```

## Non-goals

- No edits to product frontend/backend code outside the three scoped files.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files (`.planning/contours/stage[1-6]/`, `.worktrees/`, `bin/processmap-iterm-agents.sh`, `docker-compose.n8n.yml`, `file`, `scripts/cleanup-rag-index.sh`).
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Create and check out the branch:
   ```bash
   git checkout -b test/agent-max-total-time origin/main
   ```
4. Create directory `tools/agent-ui/lib/` if it does not exist.
5. Create `tools/agent-ui/lib/checkTotalTime.js`:
   ```js
   'use strict';

   const DEFAULT_MAX_TOTAL_TIME_MS = 60 * 60 * 1000;

   function checkTotalTime(task, now = Date.now()) {
     const maxTotalTime = task.options?.maxTotalTime ?? DEFAULT_MAX_TOTAL_TIME_MS;
     return now - task.startedAt > maxTotalTime;
   }

   module.exports = { checkTotalTime, DEFAULT_MAX_TOTAL_TIME_MS };
   ```
6. Create `tools/agent-ui/lib/checkTotalTime.test.js` covering:
   - elapsed < limit → `false`
   - elapsed > limit → `true`
   - elapsed == limit → `false`
   - missing `maxTotalTime` → uses default 1 hour
   - custom `maxTotalTime` → honored
   - `startedAt` null → `true` (`Date.now() - null` equals `Date.now()`)
   - `startedAt` undefined → `false` (`Date.now() - undefined` is `NaN`, and `NaN > x` is `false`)
7. Edit `tools/agent-ui/server.js`:
   - Add near the top: `const { checkTotalTime } = require('./lib/checkTotalTime');`
   - Replace `_checkTotalTime(task)` body with:
     ```js
     _checkTotalTime(task) {
       if (checkTotalTime(task)) {
         task.status = 'failed';
         task.error = 'TOTAL_TIME_EXCEEDED';
         this._log(task, 'Total time limit exceeded');
         throw new Error(task.error);
       }
     }
     ```
8. Run validation:
   ```bash
   cd /opt/processmap-test
   node --check tools/agent-ui/lib/checkTotalTime.js
   node --check tools/agent-ui/lib/checkTotalTime.test.js
   node --check tools/agent-ui/server.js
   node --test tools/agent-ui/lib/checkTotalTime.test.js
   .agents/tests/test_stage7_max_total_time.sh
   ```
9. Verify the diff:
   ```bash
   git diff --check
   git diff --name-only
   ```
   Expected: only `tools/agent-ui/lib/checkTotalTime.js`, `tools/agent-ui/lib/checkTotalTime.test.js`, and `tools/agent-ui/server.js`.
10. Stage and commit only the scoped files:
    ```bash
    git add tools/agent-ui/lib/checkTotalTime.js
    git add tools/agent-ui/lib/checkTotalTime.test.js
    git add tools/agent-ui/server.js
    git commit -m "test(agent-ui): extract checkTotalTime and add deterministic unit tests"
    ```
11. Validate:
    ```bash
    git diff --check
    git status -sb
    git log --oneline -3
    git log origin/main..HEAD
    git show --stat HEAD
    ```
12. Write `EXEC_REPORT.md` in `.planning/contours/stage7/test-maxtime-1781307868/`.
13. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Run the validation commands listed in `PLAN.md` and above. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

No browser/UI runtime proof required. Include test command output and git status/log output in `EXEC_REPORT.md`.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Files changed
- Validation command output
- Runtime proof status
- Explicit unchanged areas
- Remaining risks
