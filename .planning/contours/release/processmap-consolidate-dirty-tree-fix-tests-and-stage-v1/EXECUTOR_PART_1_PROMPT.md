# EXECUTOR PART 1 — release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1

- run_id: `20260521T090400Z-76203`
- contour: `release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1`
- role: Agent 2 / Executor (single-lane mode — all work is here)

## 0. Pre-flight (do not skip)

Confirm source truth before touching code:
```bash
cd /opt/processmap-test
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --stat
```

Expected:
- branch: `feature/process-properties-registry-backend-contract-v1`
- HEAD: `a2359d8ce732ab89f8911ec0479500ecd660a764`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- dirty tree with 13 modified files and many untracked artifacts.

If any fact diverges, stop and write `BLOCKED.md`.

## 1. Tree Consolidation

### 1.1 Classify uncommitted changes
Modified files (from `git diff --name-only`):
- `.env` → **discard** (local env tweak, never commit)
- `AGENTS.md` → **discard** unless the insertions are contour-specific rules that belong to the feature branch. If they are agent-session scratch notes, discard.
- `backend/app/routers/product_actions_registry.py` → **commit** (belongs to feature)
- `frontend/src/app/processMapRouteModel.js` → **commit**
- `frontend/src/components/ProcessStage.jsx` → **commit**
- `frontend/src/components/process/InterviewStage.jsx` → **commit**
- `frontend/src/components/process/InterviewStage.product-actions-placement.test.mjs` → **commit**
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` → **commit**
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` → **commit**
- `frontend/src/config/appVersion.js` → **stage for version bump in step 4**
- `frontend/src/lib/api.js` → **commit**
- `frontend/src/lib/apiRoutes.js` → **commit**
- `frontend/src/styles/tailwind.css` → **commit**

Untracked product files to evaluate:
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` — if this is an intentional new component, **commit** it.
- `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` — commit together with component if intentional.
- `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` — evaluate; commit if it tests committed code.
- `frontend/src/components/process/analysis/registry/` — evaluate; commit if part of the feature.
- `frontend/src/features/process/bpmn/stage/...` — evaluate; commit if part of feature.
- Any `*.png`, `*.log`, `dist.backup-*`, `*.md` in repo root — **do not commit**.

### 1.2 Produce clean tree
Options (pick the cleanest):
- If most changes belong together: `git add` the keepers, `git checkout --` the noise, then `git commit` with a message like `feat: consolidate process properties registry frontend contract and analytics hub wiring`.
- If changes are logically separate: split into 2 commits (backend contract + frontend wiring).
- After committing, `git clean -fdn` to preview removable untracked noise. Remove screenshots, logs, and backup dirs that are not in `.gitignore`.

Goal: `git status -sb` shows **zero** uncommitted product-code changes.

## 2. Run Tests — Establish Baseline

### Backend
```bash
cd /opt/processmap-test/backend
.venv/bin/python -m unittest discover -s tests -v 2>&1 | tee /tmp/backend-test-log.txt
```
Expected: all pass (confirmed by planner for `test_product_actions_registry_api`, `test_process_properties_registry_api`, `test_process_analysis_session_api`).

### Frontend
```bash
cd /opt/processmap-test/frontend
node --test "src/**/*.test.mjs" 2>&1 | tee /tmp/frontend-test-log.txt
```
Current known failures:
- `ProductActionsRegistryPanel.test.mjs` — 2 failures
- `ProcessAnalyticsHub.test.mjs` — 10 failures
- All other test files should pass.

## 3. Fix Frontend Test Failures

### 3.1 ProductActionsRegistryPanel.test.mjs (2 failures)
Failure details:
1. Line 34: `missing label: Read-only preview` — the test searches the component source for the string `"Read-only preview"`. If the component no longer uses this label, update the test to match the actual label currently in `ProductActionsRegistryPanel.jsx`.
2. Line 127: `assert.equal(productPanelSource.includes("Реестр действий"), true)` is false. Check `ProductActionsRegistryPanel.jsx` for the actual button/link text that opens the registry. Update the test to match the authoritative source code.

**Rule**: the component source code is authoritative unless the test encodes an explicit product requirement. In this contour we only fix tests, not redesign components.

### 3.2 ProcessAnalyticsHub.test.mjs (10 failures)
This test file makes source-code assertions against multiple files. The failures are:
- Missing testids / CSS classes in `ProcessAnalyticsHub.jsx`
- Missing exports in `processMapRouteModel.js`
- Missing wiring in `ProcessStage.jsx`
- Missing navigation in `WorkspaceExplorer.jsx`
- Missing surface detection in `AppShell.jsx`
- Missing top-bar handling in `TopBar.jsx`
- Missing CSS classes in `tailwind.css`
- Version string mismatch (test expects `v1.0.137`, current is `v1.0.139`)

**Decision tree for each failure**:
1. If the missing item is a simple string/testid/CSS class that should exist per the architecture, add it to the authoritative source file.
2. If the missing item represents a feature that was intentionally cut or changed, update the test to reflect reality.
3. If the missing item indicates a large missing feature (e.g. whole analytics hub wiring), document it in `TEST_GAP.md` rather than rewriting the component.

**Do not** expand the scope to rebuild ProcessAnalyticsHub or its integration. This contour is consolidation and test repair, not feature implementation.

After each fix, re-run:
```bash
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
```

## 4. Version Bump

Edit `frontend/src/config/appVersion.js`:
- Change `currentVersion` from `"v1.0.139"` → `"v1.0.140"`.
- Insert a new changelog entry at the top:
```js
{
  version: "v1.0.140",
  changes: [
    "Консолидация дерева: исправлены тесты, подготовлена сборка v1.",
  ],
},
```

Commit this version bump as a separate commit: `chore(version): bump to v1.0.140 for staging`.

## 5. Build & Stage

```bash
cd /opt/processmap-test/frontend
npm run build 2>&1 | tee /tmp/frontend-build-log.txt
```

Verify:
- `dist/` is updated.
- If `dist/build-info.json` exists, `dirty` must be `false`.
- No build errors.

## 6. Final Proof

Record in `EXEC_REPORT.md` (create in contour dir):
```bash
cd /opt/processmap-test
echo "## Git Proof" >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
git status -sb >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
git log --oneline -5 >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
git diff --stat >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md

echo "## Test Proof" >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
cat /tmp/backend-test-log.txt | tail -20 >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
cat /tmp/frontend-test-log.txt | tail -20 >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md

echo "## Build Proof" >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
ls -la frontend/dist/ >> .planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/EXEC_REPORT.md
```

## 7. Handoff

After `EXEC_REPORT.md` is written, create `WORKER_2_DONE` in the contour directory.
Then run the mirror script:
```bash
./tools/pm-agent-mirror-report.sh "release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" executor
```

## Rules
- Do not write new product features.
- Do not merge to main or open a PR.
- Do not commit secrets.
- Do not downgrade version.
- Keep all evidence compact; full logs go to files, not chat.
