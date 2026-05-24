# Branch scope checklist

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Launcher truth

```text
pwd: /opt/processmap-test
branch: fix/lockfile-sync-test
HEAD: 5b20bc2d1292f419647238eaf37dac55f9315942
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
status: dirty
cached diff: empty
```

## Required Worker 2 guard

- [ ] Start from clean worktree/branch based on `origin/main`, or document why current checkout is safe.
- [ ] Do not carry unrelated dirty tracked files into implementation.
- [ ] Do not carry untracked screenshots/dist/backups into product diff.
- [ ] Limit product-code edits to bounded Analytics/Registry files.
- [ ] No backend/schema/BPMN/RAG runtime changes.
- [ ] No package install.
- [ ] No PR/merge/deploy.

## Required report evidence

- [ ] Branch/worktree path.
- [ ] `git remote -v` with credentials redacted in report.
- [ ] `git fetch origin`.
- [ ] `git branch --show-current`.
- [ ] `git rev-parse HEAD`.
- [ ] `git rev-parse origin/main`.
- [ ] `git status -sb`.
- [ ] `git diff --name-only`.
- [ ] `git diff --cached --name-only`.
- [ ] Explanation if implementation source differs from served runtime.
