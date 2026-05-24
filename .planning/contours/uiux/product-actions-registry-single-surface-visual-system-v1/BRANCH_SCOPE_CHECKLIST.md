# BRANCH_SCOPE_CHECKLIST

## Current planning observation

- Launcher checkout: `/opt/processmap-test`.
- Branch: `fix/lockfile-sync-test`.
- Dirty tree: yes.
- Many unrelated frontend and artifact changes are present.
- This is a planning-only run; Agent 1 did not write product code.

## Worker 2 pre-edit requirements

- [ ] Clean worktree/branch from `origin/main`, or written proof current checkout is safe.
- [ ] `origin/main` fetched.
- [ ] `HEAD` and `origin/main` recorded.
- [ ] Dirty/untracked/staged state recorded.
- [ ] Product code edits limited to registry-related frontend components/styles unless strict necessity is proven.
- [ ] No unrelated BPMN/stage/runtime/explorer/shell changes pulled into this contour.
- [ ] No backend/schema/BPMN XML/RAG runtime changes.
- [ ] No package install.
- [ ] If unsafe, create `EXEC_PART_1_BLOCKED.md`.

## Reviewer branch gate

- [ ] Served build-info contour matches this contour.
- [ ] Served SHA matches implementation SHA.
- [ ] Served worktree matches implementation worktree or report explains exact build copy chain.
- [ ] Runtime review blocked if source/runtime truth diverges.

