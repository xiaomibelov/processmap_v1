# Executor Prompt: __CONTOUR_ID__

## Goal

Deliver the bounded contour exactly as described in `PLAN.md`.

## Source Truth Commands

Run before editing:

```bash
git fetch origin
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git log --oneline -15 origin/main
```

If the checkout is dirty, edit only files explicitly allowed by `PLAN.md`. Stop if unrelated dirty files block the contour.

## GSD Local Requirement

Use local GSD scripts, local `gsd-*` skills, workflow files, or safe CLI commands if available. Record what was found and used in `EXEC_REPORT.md`.

## Scope

Read `PLAN.md`. Change only the files listed there.

## Non-goals

Do not change product frontend/backend code, DB/schema, BPMN XML save logic, AI/RAG/Product Actions logic, deployment, merge, or PR state unless `PLAN.md` explicitly allows it.

## Implementation Steps

1. Read `PLAN.md`.
2. Confirm source truth.
3. Apply the scoped edits.
4. Run validation listed in `PLAN.md`.
5. Write `EXEC_REPORT.md`.
6. Create marker `READY_FOR_REVIEW`.

## Tests

Run the focused commands from `PLAN.md`. Always run `git diff --check` unless the plan says why it is not applicable.

## Runtime Proof

Collect only the proof requested by `PLAN.md`. Avoid broad audits.

## Obsidian Update

Update only the archive/handoff note requested by `PLAN.md`. Do not use Obsidian as an execution trigger.

## Final Report Format

Write `EXEC_REPORT.md` with:

- Source truth
- Files changed
- Validation run
- Runtime proof
- Obsidian update status
- Explicit unchanged areas
- Remaining risks
