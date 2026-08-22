# Worker Prompt: stage6/test-versioning-20260612T233244

## Goal

Deliver the bounded contour exactly as described in `PLAN.md`: add focused edge-case unit tests to `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs` and commit them on a dedicated branch. Do not edit product source code, merge, push, or create a PR.

## Source Truth Commands

Run before any git or edit operation:

```bash
cd /opt/processmap-test
pwd
git remote -v
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

If the working tree contains product-code changes outside the scope, stop and record the blocker in `EXEC_REPORT.md`.

## GSD Local Requirement

Use only local Node.js test runner and safe git CLI commands. Record every command and its outcome in `EXEC_REPORT.md`. No external runners are required.

## Scope

Read `PLAN.md`. Touch only this file:

- `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`

Create and use this branch:

```bash
git checkout -b test/versioning-edge-cases origin/main
```

## Non-goals

- No edits to `frontend/src/features/process/stage/utils/diagramVersionContext.js` or any other product source file.
- No changes to `.gitignore`, git config, hooks, or branch metadata.
- No deletion or staging of unrelated untracked files (`.planning/contours/stage[1-5]/`, `.worktrees/`, `bin/processmap-iterm-agents.sh`, `docker-compose.n8n.yml`, `file`, `scripts/cleanup-rag-index.sh`).
- No merge, rebase, cherry-pick, push, PR, deploy, or release.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy work.
- No runtime/UI verification.

## Implementation Steps

1. Read `PLAN.md`.
2. Run the source-truth commands above and capture output.
3. Create and check out the branch:
   ```bash
   git checkout -b test/versioning-edge-cases origin/main
   ```
4. Open `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`.
5. Ensure the import list includes `normalizeDiagramSessionId` and `normalizeDiagramStateVersion` from `./diagramVersionContext.js`.
6. Append the following focused test cases:
   - `normalizeDiagramSessionId` trims whitespace and returns empty string for `null`/`undefined`.
   - `normalizeDiagramStateVersion` rounds floats, rejects negatives, rejects non-numeric strings, and treats `null`/`undefined`/empty string as `null`.
   - `rememberMonotonicDiagramStateVersion` returns `{ accepted: false, sessionId: "", version: 0 }` when `activeSessionId` is missing.
   - `rememberMonotonicDiagramStateVersion` accepts `0` as a valid incoming version on session switch.
   - `rememberMonotonicDiagramStateVersion` accepts a higher incoming version when remembered version is `0`.
   - `rememberMonotonicDiagramStateVersion` preserves the remembered sid/version when rejecting a cross-session incoming version.
7. Run the focused test file:
   ```bash
   cd /opt/processmap-test/frontend
   node --test src/features/process/stage/utils/diagramVersionContext.test.mjs
   ```
8. Verify the diff:
   ```bash
   git diff --check
   git diff --name-only
   ```
   Expected: only `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`.
9. Stage and commit only the test file:
   ```bash
   git add frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs
   git commit -m "test(frontend): add edge-case tests for diagramVersionContext normalization helpers"
   ```
10. Validate:
    ```bash
    git diff --check
    git status -sb
    git log --oneline -3
    git log origin/main..HEAD
    git show --stat HEAD
    ```
11. Write `EXEC_REPORT.md` in `.planning/contours/stage6/test-versioning-20260612T233244/`.
12. Create the `READY_FOR_REVIEW` marker (empty file or directory) in the contour directory.

## Tests

Run the validation commands listed in `PLAN.md` and above. Capture full output in `EXEC_REPORT.md`.

## Runtime Proof

No runtime proof required. Include test command output and git status/log output in `EXEC_REPORT.md`.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth at execution time
- Files changed
- Validation command output
- Runtime proof status
- Explicit unchanged areas
- Remaining risks
