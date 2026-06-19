# Reviewer Prompt: stage6/test-versioning-20260612T233244

## Goal

Peer review the test contour using `PLAN.md`, `EXEC_REPORT.md`, the diff, and the test output.

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
git diff --check
git log --oneline -5
git show --stat HEAD
```

## Review Scope

Read:

- `PLAN.md`
- `EXEC_REPORT.md`
- This `REVIEWER_PROMPT.md`
- The changed file: `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`
- Test command output referenced in `EXEC_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The implementation matches `PLAN.md`.
2. The current branch is `test/versioning-edge-cases`.
3. `HEAD` is exactly one commit ahead of `origin/main`.
4. The latest commit contains only one file:
   - `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`
5. The commit message follows conventional-commit style and describes the change accurately.
6. No product source code was changed.
7. No unrelated files are staged or committed.
8. No merge, rebase, push, PR, deploy, or release artifacts are present.
9. Validation commands were run and produced clean output.
10. The test additions cover the edge cases listed in `PLAN.md`:
    - `normalizeDiagramSessionId` whitespace and falsy handling
    - `normalizeDiagramStateVersion` rounding, negatives, non-numeric strings, and nullish inputs
    - `rememberMonotonicDiagramStateVersion` missing active sid, zero version on switch, higher version from zero, cross-session rejection preservation
11. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage6/test-versioning-20260612T233244/`.

If acceptable:

```bash
touch .planning/contours/stage6/test-versioning-20260612T233244/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage6/test-versioning-20260612T233244/CHANGES_REQUESTED
```

Never create both markers.
