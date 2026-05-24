# REVIEWER PROMPT — feat/analytics-registries-viewmodel-ui-v1

- run_id: `20260521T223455Z-52118`
- contour: `feat/analytics-registries-viewmodel-ui-v1`
- role: Agent 4 / Reviewer
- receives: this prompt + merged `EXEC_REPORT.md` + `PLAN.md`

## Your task

Independently verify that the viewmodel layer was implemented correctly and that the UI components remain functional.

### Verification steps

1. **Source truth check**
   - `pwd`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
   - `git status -sb`
   - Confirm branch is `feat/analytics-registries-viewmodel-ui-v1` from `origin/main`.

2. **Code review**
   - Read `frontend/src/features/process/analysis/registryViewModelContracts.js` — verify JSDoc typedefs exist and are coherent.
   - Read `frontend/src/features/process/analysis/processPropertiesRegistryViewModel.js` — verify pure functions, no React hooks, no fetch.
   - Read `frontend/src/features/process/analysis/productActionsRegistryViewModel.js` — verify pure functions, no React hooks, no fetch.
   - Read `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` — verify it is thinner, delegates to viewmodel.
   - Read `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — verify it consumes viewmodel.
   - Check that no backend files were modified.

3. **Test review**
   - Run `npm run build` in `frontend/`. Must pass 0 errors.
   - Run new viewmodel tests:
     - `processPropertiesRegistryViewModel.test.mjs`
     - `productActionsRegistryViewModel.test.mjs`
   - Run existing registry tests:
     - `ProcessPropertiesRegistryPage.test.mjs`
     - `ProductActionsRegistryPage.test.mjs`
   - All must pass.

4. **Runtime proof**
   - `curl -I http://clearvestnic.ru:5180` → HTTP 200 with no-cache headers.
   - Verify the runtime is actually serving fresh build (check `build-info.json` for recent timestamp or branch).
   - Open Analytics Hub in browser.
   - Verify `Реестр действий` opens and renders without console errors.
   - Verify `Реестр свойств` opens and renders without console errors.
   - Verify no unsafe `PUT/PATCH/DELETE` calls from viewing/navigation.
   - Verify no fake data rows if source truth says foundation mode.

5. **Five-plane proof**
   - `code`: branch and commit contain only viewmodel + component refactor.
   - `workspace`: clean branch from origin/main.
   - `DB`: no schema or data changes.
   - `env/compose`: no compose or env changes.
   - `serving mode`: runtime serves expected build.

### Verdict

- `REVIEW_PASS` — only if all checks above pass.
- `CHANGES_REQUESTED` — if viewmodel functions are impure, components still mix logic, tests fail, runtime errors, or backend files were modified.
- `BLOCKED` — if runtime unreachable, branch dirty, or missing evidence.

Write `REVIEW_REPORT.md` with verdict, evidence summary, and any risks.
