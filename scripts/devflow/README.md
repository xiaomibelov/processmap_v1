# Local Devflow Packaging

`scripts/devflow/package_contour.sh` packages bounded contour work from a local terminal without depending on the agent's sandbox permissions.

## What it does

- prefers `git worktree` bootstrap from a canonical repo
- falls back to a fresh local clone when `.git/worktrees` is blocked
- reuses an existing worktree/clone path if it already exists
- runs explicit validation commands
- stages only declared paths unless `--add-all` is used
- commits, pushes, and optionally creates a PR through `gh`
- writes a summary file with bootstrap path, validation commands, commit SHA, push result, and PR result

## Required tools

- `git`
- `node` / `npm` if your contour validation needs them
- `gh` only when you want PR creation

## Example

```bash
scripts/devflow/package_contour.sh \
  --repo-root /Users/mac/PycharmProjects/processmap_canonical_main \
  --branch notes-discussion-surface-polish-v2 \
  --base origin/main \
  --worktree-path /Users/mac/PycharmProjects/processmap_canonical_main/.worktrees/notes_discussion_surface_polish_v2 \
  --clone-path /tmp/processmap_notes_discussion_surface_polish_v2 \
  --commit-message "uiux(notes): polish discussions surface" \
  --pr-title "uiux(notes): polish discussions surface" \
  --pr-body-file /tmp/notes-discussion-pr.md \
  --validate "git diff --check" \
  --validate "cd frontend && node --test src/components/NotesMvpPanel.discussions-surface-polish.test.mjs src/lib/api.noteThreads.test.mjs src/features/notes/legacyNotesBridge.test.mjs src/components/ProcessStage.diagram-actions-wiring.test.mjs" \
  --validate "cd frontend && npm run build" \
  --add-path frontend/src/App.jsx \
  --add-path frontend/src/components/NotesMvpPanel.discussions-surface-polish.test.mjs \
  --summary-file /tmp/notes-discussion-surface-polish-v2.summary
```

## Failure behavior

- `git fetch` failure does not silently succeed; it is recorded and the script falls back to clone bootstrap if needed
- validation failure stops before commit
- push failure stops before PR creation
- `gh` auth or network issues are reported as exact PR blockers, not fake success
