# EXECUTOR PART 1 — workflow/pr-stage-manual-merge-only-v1

**Role:** Agent 2 / Executor  
**Run ID:** `20260522T084703Z-81419`  
**Contour:** `workflow/pr-stage-manual-merge-only-v1`  
**Mode:** SINGLE_LANE (this is the only executor task)

---

## Task

Change the stage deployment trigger from automatic (on push to `main`) to manual (`workflow_dispatch` only).

### Step 1: Modify `.github/workflows/deploy-stage.yml`

Read the file. Change the `on:` section from:

```yaml
on:
  push:
    branches:
      - main
```

To:

```yaml
on:
  workflow_dispatch:
```

Leave the entire `jobs.deploy` body unchanged. The script already fetches and resolves `origin/main`, so it works correctly for manual dispatch.

### Step 2: Update `AGENTS.md`

Find the release flow line and update:

```
branch -> push -> PR -> user approval -> merge -> auto deploy to stage -> verify -> manual prod deploy (from main only)
```

To:

```
branch -> push -> PR -> user approval -> merge -> manual deploy to stage -> verify -> manual prod deploy (from main only)
```

### Step 3: Documentation sweep

Run:
```bash
cd /opt/processmap-test
grep -ri "auto.*deploy.*stage\|deploy.*stage.*auto" docs/ AGENTS.md README.md deploy/ --include="*.md" --include="*.txt"
```

If any hits describe the old auto-deploy behavior, update them or add a note that stage is now manual dispatch only. If no hits, skip.

### Step 4: Verify the diff

Run:
```bash
cd /opt/processmap-test
git diff --stat
git diff .github/workflows/deploy-stage.yml
git diff AGENTS.md
```

Confirm:
- Only `deploy-stage.yml` and `AGENTS.md` (plus any found docs) are modified
- No product code changes
- No secrets exposed
- The `deploy-stage.yml` job body is unchanged except for the `on:` block

### Step 5: Write EXEC_REPORT.md

Write a concise `EXEC_REPORT.md` in the contour directory summarizing:
- Files modified
- Diff stat
- Verification steps performed
- Any blockers or risks

---

## Rules

- Do NOT modify `deploy-stage-ref.yml`, `deploy-prod.yml`, or `rollback-prod.yml`
- Do NOT modify any product code (frontend/src/, backend/app/)
- Do NOT create a PR, push, merge, or deploy
- Do NOT expose secrets in any output
- Keep changes minimal
