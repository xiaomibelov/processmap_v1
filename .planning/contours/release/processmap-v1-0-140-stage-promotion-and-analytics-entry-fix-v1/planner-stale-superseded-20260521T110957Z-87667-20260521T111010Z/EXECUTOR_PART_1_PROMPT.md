# EXECUTOR PART 1 — release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1

- run_id: `20260521T101201Z-83263`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- agent: Agent 2 / Executor
- mode: SINGLE_EXECUTOR_MODE (substantive work)

## Source Truth (verify before starting)

| Check | Command | Expected |
|-------|---------|----------|
| pwd | `pwd` | `/opt/processmap-test` |
| branch | `git branch --show-current` | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `git rev-parse HEAD` | `29550c7b904a772bc2d47acc3792ad41b649d282` |
| origin/main | `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| tree clean | `git status -sb` | no uncommitted product-code changes |

If any fact differs, STOP and report divergence.

## Task A — Analytics Entry Fix

### Problem
`WorkspaceExplorer.jsx` receives `onOpenAnalyticsHub` from `ProcessStage.jsx` but never uses it. There is no UI button to open the Analytics Hub. Users must manually type `?surface=analytics`.

### Files to modify
1. `frontend/src/features/explorer/WorkspaceExplorer.jsx`
2. `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs`

### Implementation details

#### WorkspaceExplorer.jsx
1. In the default export function `WorkspaceExplorer({...})`, add `onOpenAnalyticsHub` to the destructured props (around line 2732, near `onOpenProductActionsRegistry`).
2. Pass `onOpenAnalyticsHub` into `ProjectPane` props (around line 2838, near `onOpenProductActionsRegistry={onOpenProductActionsRegistry}`).
3. In `ProjectPane({...})`, add `onOpenAnalyticsHub` to destructured props (around line 2407).
4. Add workspace-level analytics nav button:
   - Location: inside the `<div className="border-b border-border/60 px-2 py-2">` that currently contains the "Реестр действий" button (around line 1051).
   - Add a second button below the existing one with:
     - `className="workspaceAnalyticsHubNav"` (or similar, matching existing style)
     - `onClick={() => onOpenAnalyticsHub?.({ workspaceId: activeWorkspaceId })}`
     - `data-testid="workspace-analytics-hub-nav"`
     - Label: `<span>Аналитика</span>`
     - Sub-label: `<small>Реестры и дашборды</small>`
5. Add project-level analytics nav button:
   - Location: inside the project pane header area, near the existing "Реестр действий" button (around line 2583).
   - Add a button with:
     - `className="secondaryBtn h-7 min-h-0 px-3 text-xs"`
     - `onClick={() => onOpenAnalyticsHub?.({ workspaceId, projectId })}`
     - `data-testid="project-analytics-hub"`
     - Label: `Аналитика`

#### ProcessAnalyticsHub.test.mjs
- Replace the test `"WorkspaceExplorer does not yet expose analytics hub navigation"` (lines 78-82) with a test that verifies the opposite:
  - `assert.equal(explorerSource.includes("onOpenAnalyticsHub"), true);`
  - `assert.equal(explorerSource.includes('data-testid="workspace-analytics-hub-nav"'), true);`
  - `assert.equal(explorerSource.includes('data-testid="project-analytics-hub"'), true);`
- Update the test name to something like `"WorkspaceExplorer exposes analytics hub navigation"`.

### Verification after Task A
```bash
cd /opt/processmap-test/frontend
node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs
node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
```
Both must pass with 0 failures.

## Task B — Version Bump

In `frontend/src/config/appVersion.js`:
1. Change `currentVersion: "v1.0.140"` → `currentVersion: "v1.0.141"`.
2. Add a new changelog entry at the top of the `changelog` array:
```js
{
  version: "v1.0.141",
  changes: [
    "Добавлена навигация в Аналитику из Workspace Explorer.",
  ],
},
```

## Task C — Build & Git

1. Build dist:
```bash
cd /opt/processmap-test/frontend
npm run build
```
2. Verify `frontend/dist/build-info.json` has `dirty: false` (if the file exists).
3. Stage changes:
```bash
cd /opt/processmap-test
git add frontend/src/features/explorer/WorkspaceExplorer.jsx
git add frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs
git add frontend/src/config/appVersion.js
```
4. Commit:
```bash
git commit -m "fix(explorer): add analytics hub navigation entry

- WorkspaceExplorer now exposes onOpenAnalyticsHub prop
- Added workspace-level and project-level 'Аналитика' nav buttons
- Updated ProcessAnalyticsHub.test.mjs to verify navigation exists
- Bumped version to v1.0.141"
```
5. Push:
```bash
git push origin feature/process-properties-registry-backend-contract-v1
```

## Task D — Git Proof

Record in `EXEC_REPORT.md`:
```
### Git Proof (post-fix)
- branch: `git branch --show-current`
- HEAD: `git rev-parse HEAD`
- status: `git status -sb`
- diffstat: `git diff --stat origin/main`
- log: `git log --oneline -5`
```

## Task E — Request Merge Approval

DO NOT merge to main without explicit user approval. After Task D, report:
- "Analytics entry fix complete. Branch pushed. Awaiting user approval to merge to main."

## Task F — Merge & Deploy (only after explicit user "yes")

1. Merge to main:
```bash
cd /opt/processmap-test
git checkout main
git pull origin main
git merge feature/process-properties-registry-backend-contract-v1
# or: git merge --ff-only feature/process-properties-registry-backend-contract-v1
git push origin main
```
2. Deploy to stage using existing deploy scripts (check `deploy/scripts/`).
3. Verify runtime with `curl -I http://clearvestnic.ru:5180`.
4. Record runtime proof in `EXEC_REPORT.md` (5 planes: code/workspace/DB/env/serving).

## Rules
- Make MINIMAL changes. Do not refactor WorkspaceExplorer.
- Do not modify TopBar, AppShell, or CSS beyond the scope above.
- Do not merge without explicit user approval.
- Do not deploy to prod — stage only.
- If any test fails, fix before proceeding.
