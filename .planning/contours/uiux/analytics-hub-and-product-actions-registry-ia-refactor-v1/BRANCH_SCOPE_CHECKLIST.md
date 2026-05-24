# Branch and scope checklist

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`

## Required before product-code edits

- [ ] Branch starts from current `origin/main`, or safety exception is documented.
- [ ] Working tree is clean before implementation, or unrelated dirty changes are isolated outside touched files.
- [ ] `git status -sb` recorded before edits.
- [ ] `git diff --name-only` recorded before edits.
- [ ] Implementation is bounded to Analytics Hub / Product Actions Registry frontend files.
- [ ] No backend files changed.
- [ ] No schema/migration files changed.
- [ ] No BPMN XML mutation logic changed.
- [ ] No RAG runtime logic changed.
- [ ] No global shell/header/sidebar redesign.
- [ ] No package install or lockfile churn unless already required by existing repo state and explicitly justified.

## Expected touched area

Allowed only when required by existing code structure:
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/registry/**`
- related frontend tests for Analytics Hub / Product Actions Registry
- narrowly related styles used only by these surfaces
- `frontend/src/config/appVersion.js` or generated build-info/version row by existing local pattern

## Block conditions

Create `EXEC_PART_1_BLOCKED.md` if:
- clean branch/worktree cannot be established;
- touched files contain unrelated dirty changes that cannot be safely isolated;
- requested UI requires backend/schema/RAG mutation;
- existing data cannot support a proposed row/detail pattern and no safe extension point can be documented;
- implementation would require package installation.

Create `EXEC_PART_2_BLOCKED.md` if:
- acceptance/runtime checklist cannot be written without missing master-plan/user-feedback context;
- required prompt artifacts are absent and cannot be reconstructed from the contour docs.
