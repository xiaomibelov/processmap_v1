# PLAN — workflow/pr-stage-manual-merge-only-v1

**Contour:** `workflow/pr-stage-manual-merge-only-v1`  
**Run ID:** `20260522T084703Z-81419`  
**Planner:** Agent 1  
**Status:** READY_FOR_EXECUTION  
**Execution Mode:** SINGLE_LANE (token-economy single executor)

---

## 1. Objective

Change the stage deployment workflow from **auto-deploy on push to `main`** to **manual workflow_dispatch only**, matching the prod deployment pattern.

Current behavior: `.github/workflows/deploy-stage.yml` triggers on every `push` to `main`.  
Target behavior: stage deploy requires explicit manual trigger via GitHub Actions UI.

---

## 2. Source Truth

| Plane | Fact |
|---|---|
| Code | Branch `uiux/registry-ui-spec-implementation-v1`, HEAD `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| Workflow files | `.github/workflows/deploy-stage.yml` (auto-deploy on push), `.github/workflows/deploy-stage-ref.yml` (manual ref dispatch), `.github/workflows/deploy-prod.yml` (manual dispatch) |
| Policy | `AGENTS.md` release flow: `branch -> push -> PR -> user approval -> merge -> auto deploy to stage -> verify -> manual prod deploy` |
| Runtime | Not applicable; this is a GitHub Actions workflow change |

---

## 3. Bounded Scope

### In Scope
- `.github/workflows/deploy-stage.yml` — change trigger from `on.push.branches: [main]` to `on.workflow_dispatch`
- `AGENTS.md` — update release flow line: `auto deploy to stage` → `manual deploy to stage`
- Search for any other docs referencing auto stage deploy and update them

### Out of Scope
- No changes to `deploy-stage-ref.yml`
- No changes to `deploy-prod.yml` or `rollback-prod.yml`
- No changes to deploy scripts (`deploy/scripts/*`)
- No changes to product code (frontend/backend)
- No changes to secrets or environment variables
- No PR creation or merge by Agent 1/2/3

---

## 4. Implementation Details

### File: `.github/workflows/deploy-stage.yml`

Change:
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

Keep the entire `jobs.deploy` body unchanged. The job already resolves `origin/main` internally, so it remains correct for manual dispatch.

### File: `AGENTS.md`

Update release flow line from:
```
branch -> push -> PR -> user approval -> merge -> auto deploy to stage -> verify -> manual prod deploy (from main only)
```

To:
```
branch -> push -> PR -> user approval -> merge -> manual deploy to stage -> verify -> manual prod deploy (from main only)
```

### Documentation sweep

Search and update any other `.md` files that describe the stage deploy as automatic:
```bash
grep -ri "auto.*deploy.*stage\|deploy.*stage.*auto" docs/ AGENTS.md README.md --include="*.md"
```

---

## 5. Acceptance Criteria

- [ ] `deploy-stage.yml` no longer contains `on.push.branches`
- [ ] `deploy-stage.yml` contains only `on.workflow_dispatch`
- [ ] `deploy-stage.yml` job body is otherwise unchanged
- [ ] `AGENTS.md` release flow reflects `manual deploy to stage`
- [ ] No other files reference auto stage deploy (or they are updated)
- [ ] No product code changes
- [ ] No secrets exposed in diffs

---

## 6. Context Sources

- RAG preflight: `.planning/contours/workflow/pr-stage-manual-merge-only-v1/RAG_PREFLIGHT_PLANNER.md`
- Obsidian context: `.planning/contours/workflow/pr-stage-manual-merge-only-v1/OBSIDIAN_CONTEXT_USED.md`
- GSD context: `.planning/contours/workflow/pr-stage-manual-merge-only-v1/GSD_CONTEXT_USED.md`
- Previous release contour: `.planning/contours/release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1/PLAN.md`
