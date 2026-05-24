# CLEAN_BRANCH_STRATEGY

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`

## Recommended strategy

1. Create a clean worktree from fresh `origin/main`:

```bash
git fetch origin
git worktree add ../processmap-analytics-registry-clean origin/main
cd ../processmap-analytics-registry-clean
git switch -c feature/analytics-hub-registry-redesign-clean
```

2. From the dirty source checkout, create non-destructive patches only for the merge manifest:

```bash
git diff -- \
  frontend/src/app/processMapRouteModel.js \
  frontend/src/components/AppShell.jsx \
  frontend/src/components/ProcessStage.jsx \
  frontend/src/components/TopBar.jsx \
  frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs \
  frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx \
  frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs \
  frontend/src/config/appVersion.js \
  frontend/src/features/explorer/WorkspaceExplorer.jsx \
  frontend/src/styles/app/06-final-structure.css \
  frontend/src/styles/tailwind.css \
  > /tmp/processmap-analytics-registry-tracked.patch
```

3. Copy or patch only approved untracked product files from the manifest:

```text
frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx
frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs
frontend/src/components/process/analysis/registry/
frontend/public/build-info.json
frontend/src/generated/buildInfo.js
scripts/generate-build-info.mjs
```

4. Apply the tracked patch in the clean worktree and review before committing:

```bash
git apply --check /tmp/processmap-analytics-registry-tracked.patch
git apply /tmp/processmap-analytics-registry-tracked.patch
git status -sb
git diff --name-only
```

5. Manually inspect `frontend/src/styles/tailwind.css` and `frontend/src/styles/app/06-final-structure.css` for unrelated diagram/runtime selectors before committing.

6. Run focused validation after isolation:

```bash
cd frontend
npm test -- ProductActionsRegistryPanel.test.mjs ProductActionsRegistryPage.test.mjs ProcessAnalyticsHub.test.mjs
npm run build
```

7. Start/restart reviewed runtime only after clean branch build is ready, then verify `:5180` routes and `build-info.json`.

## Prohibited in this contour

- No `git reset --hard`.
- No `git clean`.
- No force checkout over dirty files.
- No deletion of untracked evidence/tooling files.
- No push, PR, merge, or deploy.
