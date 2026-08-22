# Worker Prompt: stage5/test-git-fix-20260612T231759Z

## Goal

Deliver the bounded contour exactly as described in `PLAN.md`: produce a single, atomic git commit on `fix/session-presence-test-timeout` containing only the two already-reviewed presence files. Do not edit code, merge, push, or create a PR.

## Source Truth Commands

Run before any git operation:

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

If the current branch is not `fix/session-presence-test-timeout`, or if the diff contains files other than the two scoped presence files, stop and record the blocker in `EXEC_REPORT.md`.

## GSD Local Requirement

Use only safe git CLI commands. Record every command and its outcome in `EXEC_REPORT.md`. No external runners are required.

## Scope

Read `PLAN.md`. Touch only these two files, and only through git add/commit:

- `frontend/src/features/process/stage/presence/useSessionPresence.js`
- `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`

Do not modify file contents. Do not stage any other files.

## Non-goals

- No code edits, refactors, or reformatting.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files (`.planning/contours/stage1/`, `.planning/contours/stage2/`, `.planning/contours/stage3/`, `.planning/contours/stage4/`, `.worktrees/`, `bin/processmap-iterm-agents.sh`, `docker-compose.n8n.yml`, `file`, `scripts/cleanup-rag-index.sh`).
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG/Product Actions work.
- No runtime/UI verification.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Inspect the existing diff:
   ```bash
   git diff -- frontend/src/features/process/stage/presence/useSessionPresence.js
   git diff -- frontend/src/features/process/stage/presence/useSessionPresence.test.mjs
   ```
   Confirm it matches the approved stage4 review: heartbeat clamp removed, slow waits reduced.
4. Stage only the two scoped files:
   ```bash
   git add frontend/src/features/process/stage/presence/useSessionPresence.js
   git add frontend/src/features/process/stage/presence/useSessionPresence.test.mjs
   ```
5. Verify the staged set:
   ```bash
   git diff --cached --name-only
   git diff --cached --stat
   ```
   Expected: exactly the two files above.
6. Commit with this exact message:
   ```bash
   git commit -m "fix(tests): remove 5000 ms heartbeat clamp and speed up useSessionPresence tests"
   ```
7. Validate:
   ```bash
   git diff --check
   git status -sb
   git log --oneline -3
   git log origin/main..HEAD
   git show --stat HEAD
   ```
8. Write `EXEC_REPORT.md` in `.planning/contours/stage5/test-git-fix-20260612T231759Z/`.
9. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Run the validation commands listed in `PLAN.md` and above. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

No runtime proof required. Include git status/log output in `EXEC_REPORT.md`.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Files committed (not edited)
- Validation command output
- Runtime proof status
- Explicit unchanged areas
- Remaining risks
