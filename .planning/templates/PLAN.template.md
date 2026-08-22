# Plan: __CONTOUR_ID__

## Goal

Describe the single bounded result this contour must deliver.

## Source Truth

- Repo: `<repo path>`
- Branch: `<branch>`
- HEAD: `<sha>`
- Base truth: `origin/main`
- Merge-base: `<sha>`
- Status: `<clean/dirty summary>`

## GSD Local Sources

- Required: use local scripts, local skills, workflow files, or safe CLI commands.
- Record which `gsd-*` SKILL.md or workflow files were read.
- Do not require an external runner as the primary path.

## Scope

- Allowed files:
  - `<path>`

## Non-goals

- Product frontend code.
- Product backend code.
- DB/schema changes.
- BPMN XML save behavior.
- AI/RAG/Product Actions logic unless explicitly in scope.
- PR, merge, or deploy.

## Implementation Steps

1. Capture source truth.
2. Make only scoped edits.
3. Run focused validation.
4. Update Obsidian archive/handoff if required.
5. Write `EXEC_REPORT.md`.

## Validation

- `git diff --check`
- Targeted syntax/tests for changed files.
- Diff guard: only scoped files changed.

## Runtime Proof

Record commands, outputs, screenshots, or network evidence required for this contour. If not applicable, state `Runtime proof: not applicable`.

## Review Inputs

- `PLAN.md`
- `EXEC_REPORT.md`
- `git diff`
- Runtime proof listed above
