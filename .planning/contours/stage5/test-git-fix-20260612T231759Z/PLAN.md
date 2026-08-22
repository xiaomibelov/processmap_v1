# Plan: stage5/test-git-fix-20260612T231759Z

## Goal

Fix the git state for the already-reviewed `useSessionPresence` test-timeout contour by producing a single, atomic commit on the dedicated branch. The commit must include only the two scoped product files and must not edit code, merge, deploy, or open a PR.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch: `fix/session-presence-test-timeout`
- HEAD: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status: dirty; uncommitted changes in:
  - `frontend/src/features/process/stage/presence/useSessionPresence.js`
  - `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`
- Unrelated untracked files (must stay untouched): `.planning/contours/stage1/`, `.planning/contours/stage2/`, `.planning/contours/stage3/`, `.planning/contours/stage4/`, `.worktrees/`, `bin/processmap-iterm-agents.sh`, `docker-compose.n8n.yml`, `file`, `scripts/cleanup-rag-index.sh`
- Predecessor contour: `stage4/test-timeout-1781303549` (review passed; changes not yet committed)

## GSD Local Sources

- Templates: `.planning/templates/PLAN.template.md`, `.planning/templates/EXECUTOR_PROMPT.template.md`, `.planning/templates/REVIEWER_PROMPT.template.md`, `.planning/templates/STATE.template.json`
- AGENTS.md §3 source-truth discipline, §6 bounded-contour / no-mixing rule
- Prior contour: `.planning/contours/stage4/test-timeout-1781303549/REVIEW_REPORT.md` (PASS)

## Scope

Allowed operations:
- Inspect git state.
- Stage and commit only these two files:
  - `frontend/src/features/process/stage/presence/useSessionPresence.js`
  - `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`

Allowed git commands:
- `git status`, `git diff`, `git diff --cached`, `git add`, `git commit`, `git log`

## Non-goals

- No edits to product code, tests, docs, or configuration.
- No changes to `.gitignore`, git config, or branch structure.
- No deletion or staging of unrelated untracked files.
- No merge, rebase, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG/Product Actions work.
- No runtime/UI verification (the code change was already reviewed in stage4).

## Implementation Steps

1. Capture source truth (commands in `WORKER_PROMPT.md`).
2. Confirm the diff matches the approved stage4 changes:
   - `useSessionPresence.js` removes the `Math.max(5000, ...)` heartbeat clamp.
   - `useSessionPresence.test.mjs` replaces 6500 ms / 12000 ms waits with sub-second waits and updates assertions.
3. Stage only the two scoped files.
4. Verify the staged set is exactly the two files (`git diff --cached --name-only`).
5. Commit with a concise, conventional message:
   ```text
   fix(tests): remove 5000 ms heartbeat clamp and speed up useSessionPresence tests
   ```
6. Run validation commands.
7. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` (no whitespace errors)
- `git status -sb` (working tree clean except for pre-existing unrelated untracked files)
- `git diff --cached --name-only` returns exactly the two scoped files before commit
- `git log --oneline -3` shows the new commit on `fix/session-presence-test-timeout`
- `git log origin/main..HEAD` shows exactly one commit ahead of `origin/main`

## Runtime Proof

Runtime proof: not applicable. This contour is a git-hygiene follow-up to the already-reviewed stage4 unit-test contour.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- `git log` and `git status` output
- Commit diff (`git show --stat HEAD`)
