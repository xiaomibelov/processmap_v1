# Worker Prompt: __CONTOUR_ID__

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

Use local GSD scripts, local `gsd-*` skills, workflow files, or safe CLI commands if available. Record what was found and used in `WORKER_REPORT.md`.

## Scope

Read `PLAN.md`. Change only the files listed there.

## Non-goals

Do not change product frontend/backend code, DB/schema, BPMN XML save logic, AI/RAG/Product Actions logic, deployment, merge, or PR state unless `PLAN.md` explicitly allows it.

## Implementation Steps

1. Read `PLAN.md`.
2. Confirm source truth.
3. Apply the scoped edits.
4. Run validation listed in `PLAN.md`.
5. Write `WORKER_REPORT.md`.
6. Create marker `WORKER_DONE`.

## Tests

Run the focused commands from `PLAN.md`. Always run `git diff --check` unless the plan says why it is not applicable.

## Runtime Proof

Collect only the proof requested by `PLAN.md`. Avoid broad audits.

## Runtime navigation pack

Use local runtime pack before exploring the UI manually:

- `.local/processmap/stage.env`
- `.local/processmap/playwright/stage-admin-storage-state.json`
- `.local/processmap/stage-runtime-navigation.md`

Open direct `PROCESSMAP_STAGE_SESSION_URL`.
Do not search Explorer/workspaces unless this contour explicitly requires Explorer.

If storage state is missing, run `node tools/stage-auth-save-storage-state.mjs`. For compact proof, run `node tools/stage-open-session-proof.mjs analysis|diagram|xml|doc|dod`.

## Obsidian Update

Update only the archive/handoff note requested by `PLAN.md`. Do not use Obsidian as an execution trigger.

## Final Report Format

Write `WORKER_REPORT.md` with:

- Source truth
- Files changed
- Validation run
- Runtime proof
- Obsidian update status
- Explicit unchanged areas
- Remaining risks
