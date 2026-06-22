# Plan: stage6/test-versioning-20260612T233244

## Goal

Add focused, deterministic unit tests that guard the edge cases of the diagram-version context helpers in `frontend/src/features/process/stage/utils/diagramVersionContext.js`. The contour only extends the existing test file; no product source code is edited.

## Source Truth

- Repo: `/opt/processmap-test`
- Remote: `git@github.com:xiaomibelov/processmap_v1.git`
- Current branch (at planning time): `fix/session-presence-test-timeout`
- HEAD: `2d3f9cd2b411d857be8de3e6c737d02ce4830ea5`
- Base truth: `origin/main` at `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status at planning time: clean except for pre-existing unrelated untracked files (`.planning/contours/stage[1-5]/`, `.worktrees/`, `bin/processmap-iterm-agents.sh`, `docker-compose.n8n.yml`, `file`, `scripts/cleanup-rag-index.sh`)

## GSD Local Sources

- Templates: `.planning/templates/PLAN.template.md`, `.planning/templates/EXECUTOR_PROMPT.template.md`, `.planning/templates/REVIEWER_PROMPT.template.md`, `.planning/templates/STATE.template.json`
- AGENTS.md §2 (branch isolation), §3 (source truth), §6 (bounded contour / no mixing)
- Existing test file: `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`
- Existing source file: `frontend/src/features/process/stage/utils/diagramVersionContext.js`

## Scope

Allowed operations:
- Create a new branch `test/versioning-edge-cases` from `origin/main`.
- Edit only: `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`

Allowed test additions:
1. Direct tests for `normalizeDiagramSessionId` covering whitespace and falsy inputs.
2. Direct tests for `normalizeDiagramStateVersion` covering rounding, negative values, non-numeric strings, `null`, `undefined`, empty string, and floating-point input.
3. Additional tests for `rememberMonotonicDiagramStateVersion` covering:
   - active session id missing (returns `{ accepted: false, sessionId: "", version: 0 }`),
   - zero incoming version on session switch,
   - zero remembered version with higher incoming version,
   - rejected cross-session version does not overwrite remembered sid/version.

## Non-goals

- No edits to `frontend/src/features/process/stage/utils/diagramVersionContext.js` or any other product source file.
- No DB/schema, BPMN XML, AI/RAG, Product Actions, export, or deploy changes.
- No merge, rebase, push, PR, or release.
- No runtime/UI verification (this is a pure Node.js unit-test contour).
- No Obsidian updates beyond the mirror report performed by the planner.

## Implementation Steps

1. Capture source truth (commands in `WORKER_PROMPT.md`).
2. Create and check out a new branch `test/versioning-edge-cases` from `origin/main`.
3. Open `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`.
4. Import `normalizeDiagramSessionId` and `normalizeDiagramStateVersion` if not already imported.
5. Append the edge-case tests listed in Scope.
6. Run `node --test src/features/process/stage/utils/diagramVersionContext.test.mjs` and confirm all tests pass.
7. Run `git diff --check` and `git diff --name-only` to confirm only the test file changed.
8. Commit with a conventional-commit message:
   ```text
   test(frontend): add edge-case tests for diagramVersionContext normalization helpers
   ```
9. Write `EXEC_REPORT.md` and create the `READY_FOR_REVIEW` marker in this contour directory.

## Validation

- `git diff --check` reports no whitespace errors.
- `git diff --name-only` returns exactly one path:
  - `frontend/src/features/process/stage/utils/diagramVersionContext.test.mjs`
- `node --test src/features/process/stage/utils/diagramVersionContext.test.mjs` passes with no failures.
- `git log --oneline -3` shows the new commit on `test/versioning-edge-cases`.
- `git log origin/main..HEAD` shows exactly one commit ahead of `origin/main`.

## Runtime Proof

Runtime proof: not applicable. This contour is a pure Node.js unit-test addition with no UI/runtime surface.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- `git diff` output
- Test command output
