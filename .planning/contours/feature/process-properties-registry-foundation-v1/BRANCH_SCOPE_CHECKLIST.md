# BRANCH_SCOPE_CHECKLIST

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Current launcher risk

Planner source truth:

```text
branch: fix/lockfile-sync-test
HEAD: 5b20bc2d1292f419647238eaf37dac55f9315942
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
status: dirty tracked frontend files plus many untracked artifacts
cached diff: empty
```

## Worker 2 gate

Worker 2 must choose one:

- [ ] clean worktree/branch from `origin/main`;
- [ ] documented proof that current checkout is safe.

If neither is true:

- [ ] write `EXEC_PART_1_BLOCKED.md`;
- [ ] do not write `WORKER_2_DONE`.

## Scope boundaries

Allowed product area only if needed:

- Analytics routing/navigation;
- Analytics Hub module wiring;
- Properties Registry page/shell;
- bounded registry styles/tests;
- version row.

Forbidden:

- backend/schema;
- BPMN XML writes;
- Product Actions durable truth changes;
- RAG runtime;
- package install;
- broad shell/header/sidebar redesign.
