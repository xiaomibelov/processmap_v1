# Reviewer Prompt: stage5/test-git-fix-20260612T231759Z

## Goal

Peer review the git-hygiene contour using `PLAN.md`, `EXEC_REPORT.md`, `git status`, `git log`, and the commit diff.

## Source Truth Commands

Run before review:

```bash
cd /opt/processmap-test
pwd
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
git diff --check
git log --oneline -5
git show --stat HEAD
```

## Review Scope

Read:

- `PLAN.md`
- `EXEC_REPORT.md`
- This `REVIEWER_PROMPT.md`
- `git log` and `git show --stat HEAD` output
- `git status` output

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The implementation matches `PLAN.md`.
2. The current branch is `fix/session-presence-test-timeout`.
3. `HEAD` is exactly one commit ahead of `origin/main`.
4. The latest commit contains only the two scoped files:
   - `frontend/src/features/process/stage/presence/useSessionPresence.js`
   - `frontend/src/features/process/stage/presence/useSessionPresence.test.mjs`
5. The commit message follows conventional-commit style and describes the change accurately.
6. No unrelated files are staged or committed.
7. No merge, rebase, push, PR, deploy, or release artifacts are present.
8. No product code, schema, BPMN XML, AI/RAG, export, or deploy changes outside the two scoped files.
9. Validation commands were run and produced clean output.
10. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage5/test-git-fix-20260612T231759Z/`.

If acceptable:

```bash
touch .planning/contours/stage5/test-git-fix-20260612T231759Z/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage5/test-git-fix-20260612T231759Z/CHANGES_REQUESTED
```

Never create both markers.
