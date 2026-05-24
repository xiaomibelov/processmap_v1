# Branch scope checklist

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`

## Known launcher state

- Launcher checkout: `/opt/processmap-test`.
- Launcher branch during planning: `fix/lockfile-sync-test`.
- Launcher tree is dirty with tracked frontend changes and many untracked artifacts.
- Planning artifacts are allowed in this contour directory.
- Product-code edits in this launcher checkout are unsafe unless explicitly isolated/proven.

## Worker 2 branch gate

- [ ] Clean worktree/branch created from `origin/main`, or current checkout safety explicitly proven.
- [ ] Branch name is contour-specific.
- [ ] Diff contains only bounded Analytics Hub / Product Actions Registry frontend changes.
- [ ] No unrelated dirty files included.
- [ ] No backend/schema/BPMN/RAG/package/global shell changes.
- [ ] Version row updated according to established local workflow.
- [ ] Report includes exact changed file list.
- [ ] If branch safety cannot be proven, `EXEC_PART_1_BLOCKED.md` is created.

## Reviewer gate

- [ ] Reviewer confirms served build comes from the implementation branch/worktree.
- [ ] Reviewer confirms code-plane proof is not just dirty `origin/main`.
- [ ] Reviewer refuses pass if implementation is not reproducible or is mixed with unrelated dirty changes.

