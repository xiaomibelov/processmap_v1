# Plan: stage7/test-maxtime-1781307868

## Goal

Make the agent scheduler's total-time limit check deterministic and testable by extracting `_checkTotalTime` from `tools/agent-ui/server.js` into a focused module, adding unit tests, and verifying the existing stage-7 max-total-time simulation still passes.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch (at planning time): `test/versioning-edge-cases`
- HEAD: `48f2950b8e2049797489f83c96b4af05b4323b1a`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status at planning time: clean except for pre-existing unrelated untracked files (`.planning/contours/stage[1-6]/`, `.worktrees/`, `bin/processmap-iterm-agents.sh`, `docker-compose.n8n.yml`, `file`, `scripts/cleanup-rag-index.sh`)

## GSD Local Sources

- Templates: `.planning/templates/PLAN.template.md`, `.planning/templates/EXECUTOR_PROMPT.template.md`, `.planning/templates/REVIEWER_PROMPT.template.md`, `.planning/templates/STATE.template.json`
- AGENTS.md §2 (branch isolation), §3 (source truth), §6 (bounded contour / no mixing)
- Target source file: `tools/agent-ui/server.js` (`WorkflowScheduler._checkTotalTime`)
- Existing simulation test: `.agents/tests/test_stage7_max_total_time.sh`

## Scope

Allowed operations:
- Create a new branch `test/agent-max-total-time` from `origin/main`.
- Create new file: `tools/agent-ui/lib/checkTotalTime.js`
- Create new file: `tools/agent-ui/lib/checkTotalTime.test.js`
- Edit only: `tools/agent-ui/server.js` (replace inline `_checkTotalTime` body with a call to the extracted module)

Allowed changes:
1. Extract the time-limit predicate into `tools/agent-ui/lib/checkTotalTime.js`:
   - Accept `task` and optional `now` timestamp.
   - Fall back to `60 * 60 * 1000` ms when `task.options.maxTotalTime` is not set.
   - Return `true` when `now - task.startedAt > maxTotalTime`, otherwise `false`.
2. Update `tools/agent-ui/server.js`:
   - `require('./lib/checkTotalTime')` at the top.
   - Keep `_checkTotalTime` as the method that mutates `task.status`/`task.error`, logs, and throws, but delegate the predicate to the extracted function.
3. Add `tools/agent-ui/lib/checkTotalTime.test.js` with deterministic cases:
   - Not exceeded when elapsed < limit.
   - Exceeded when elapsed > limit.
   - Not exceeded when elapsed == limit (strict greater-than).
   - Default limit (1 hour) used when `maxTotalTime` is missing.
   - Custom `maxTotalTime` honored.
   - `startedAt` of `null` treated as exceeded by the predicate (`Date.now() - null` equals `Date.now()`).
   - `startedAt` of `undefined` treated as not exceeded by the predicate (`Date.now() - undefined` is `NaN`, and `NaN > x` is `false`).

## Non-goals

- No edits to product frontend/backend code outside the three files above.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No browser/runtime UI navigation (this is a server-side unit-test contour).

## Implementation Steps

1. Capture source truth (commands in `WORKER_PROMPT.md`).
2. Create and check out a new branch `test/agent-max-total-time` from `origin/main`.
3. Create `tools/agent-ui/lib/checkTotalTime.js` with the pure predicate.
4. Create `tools/agent-ui/lib/checkTotalTime.test.js` with the test cases listed in Scope.
5. Edit `tools/agent-ui/server.js` to import and use the extracted predicate.
6. Run validation commands:
   - `node --check tools/agent-ui/lib/checkTotalTime.js`
   - `node --check tools/agent-ui/lib/checkTotalTime.test.js`
   - `node --check tools/agent-ui/server.js`
   - `node --test tools/agent-ui/lib/checkTotalTime.test.js`
   - `.agents/tests/test_stage7_max_total_time.sh`
7. Run `git diff --check` and `git diff --name-only` to confirm only the scoped files changed.
8. Commit with a conventional-commit message:
   ```text
   test(agent-ui): extract checkTotalTime and add deterministic unit tests
   ```
9. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` reports no whitespace errors.
- `git diff --name-only` returns exactly these paths:
  - `tools/agent-ui/lib/checkTotalTime.js`
  - `tools/agent-ui/lib/checkTotalTime.test.js`
  - `tools/agent-ui/server.js`
- `node --check` passes for all three changed files.
- `node --test tools/agent-ui/lib/checkTotalTime.test.js` passes with no failures.
- `.agents/tests/test_stage7_max_total_time.sh` exits 0 and prints `PASS`.
- `git log --oneline -3` shows the new commit on `test/agent-max-total-time`.
- `git log origin/main..HEAD` shows exactly one commit ahead of `origin/main`.

## Runtime Proof

Runtime proof: not applicable for browser/UI navigation. This contour adds server-side unit tests and a deterministic bash simulation. The worker must include the test command outputs in `EXEC_REPORT.md`.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- `git diff` output
- Test command outputs
