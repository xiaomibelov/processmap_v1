# PLAN — release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1

- run_id: `20260521T101201Z-83263`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- mode: `SINGLE_EXECUTOR_MODE`
- planner: Agent 1
- created_at: `2026-05-21T10:12Z`

## 1. Source / Runtime Truth

| Fact | Value |
|------|-------|
| workspace | `/opt/processmap-test` |
| branch | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `29550c7b904a772bc2d47acc3792ad41b649d282` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| commits ahead of main | 6 |
| tree state | clean (no uncommitted product-code changes) |
| current version | `v1.0.140` |
| frontend build | ✅ passes (`vite build` 26s, no errors) |
| backend tests (relevant) | ✅ pass (`test_process_properties_registry_api` 18/18) |
| frontend tests (relevant) | ✅ pass (`ProcessAnalyticsHub.test.mjs` 14/14, `ProductActionsRegistryPanel.test.mjs` 9/9) |
| runtime URL | `http://clearvestnic.ru:5180` (unreachable from planner — expected) |

## 2. Bounded Scope

This contour is strictly **analytics entry fix + stage promotion**. No new product features beyond the missing navigation.

### 2.1 Analytics Entry Fix
**Root cause:** `ProcessStage.jsx` defines `openAnalyticsHub` and passes `onOpenAnalyticsHub={openAnalyticsHub}` to `WorkspaceExplorer`, but `WorkspaceExplorer.jsx` never destructures or uses the prop. Users can only reach the Analytics Hub by manual URL manipulation (`?surface=analytics`). The test `ProcessAnalyticsHub.test.mjs` line 78 explicitly asserts this gap (`"does not yet expose"`).

**Fix required:**
1. `WorkspaceExplorer.jsx` — destructure `onOpenAnalyticsHub` in default export props.
2. `WorkspaceExplorer.jsx` — add workspace-level "Аналитика" nav button adjacent to "Реестр действий" (line ~1050).
3. `WorkspaceExplorer.jsx` — add project-level "Аналитика" nav button adjacent to "Реестр действий" (line ~2585).
4. `WorkspaceExplorer.jsx` — pass `onOpenAnalyticsHub` into `ProjectPane` props and wire it.
5. `ProcessAnalyticsHub.test.mjs` — invert the "does not yet expose" test to verify navigation IS exposed (`data-testid="workspace-analytics-hub-nav"`, `data-testid="project-analytics-hub"`).

**Out of scope:**
- TopBar analytics surface detection (test line 89 asserts `false` — leave unchanged).
- AppShell analytics surface detection (test line 84 asserts `false` — leave unchanged).
- CSS scoped classes for analytics hub (test line 94 asserts `false` — leave unchanged).
- Any changes to `ProcessAnalyticsHub.jsx` component internals.

### 2.2 Stage Promotion
1. Bump `frontend/src/config/appVersion.js` → `v1.0.141` with Russian changelog entry describing the analytics entry fix.
2. Build frontend dist (`npm run build`).
3. Verify `build-info.json` has `dirty: false`.
4. Commit all changes with conventional commit message.
5. Push branch `feature/process-properties-registry-backend-contract-v1` to `origin`.
6. Open PR (or fast-forward merge if branch is clean) — **BLOCKED for explicit user approval per AGENTS.md §7**.
7. After user approval, merge to `main`.
8. Deploy to stage (follow existing deploy scripts in `deploy/`).
9. Verify runtime: `curl -I http://clearvestnic.ru:5180` → HTTP 200, confirm `Last-Modified` is fresh.

## 3. Execution Steps (single lane)

1. **Implement analytics entry fix** in `WorkspaceExplorer.jsx` and `ProcessAnalyticsHub.test.mjs`.
2. **Run frontend tests** — `node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`; confirm 0 failures.
3. **Bump version** → `v1.0.141` with changelog entry in Russian.
4. **Build dist** — `npm run build`; verify success.
5. **Git commit** — conventional message: `fix(explorer): add analytics hub navigation entry`.
6. **Git push** — push current branch to origin.
7. **Git proof** — record `git status -sb`, `git log --oneline -3`, `git diff --stat`.
8. **Request user approval for merge** — DO NOT merge without explicit user "yes".
9. **Merge to main** (after approval).
10. **Deploy to stage** — run deploy scripts, verify runtime is serving.
11. **Runtime proof** — 5 planes: code/workspace/DB/env/serving mode.

## 4. Acceptance Criteria

- [ ] `WorkspaceExplorer.jsx` exposes `onOpenAnalyticsHub` and renders analytics nav buttons at workspace and project levels.
- [ ] `ProcessAnalyticsHub.test.mjs` verifies analytics navigation is exposed (not missing).
- [ ] Frontend `node --test` suite passes with 0 failures for analytics and registry tests.
- [ ] `appVersion.js` reads `currentVersion: "v1.0.141"` with a changelog entry for the fix.
- [ ] Frontend dist builds successfully.
- [ ] `build-info.json` has `dirty: false`.
- [ ] Branch pushed to origin.
- [ ] User explicitly approved merge to main.
- [ ] Merged to main and runtime on stage serves updated build.
- [ ] No secrets committed.

## 5. Blockers & Risks

- **Risk**: Merge to main is blocked until user explicitly approves (AGENTS.md §7).
- **Risk**: Stage deploy may require manual steps; executor must follow `deploy/ROLLBACK.md` if needed.
- **Risk**: If runtime verification fails after deploy, executor must document failure and stop (do not promote to prod).
- **Risk**: `WorkspaceExplorer.jsx` is a large file; executor must make minimal, targeted edits.

## 6. Context Sources

- RAG preflight: `.planning/contours/release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1/RAG_PREFLIGHT_PLANNER.md`
- Obsidian context: `.planning/contours/release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1/OBSIDIAN_CONTEXT_USED.md`
- GSD context: `.planning/contours/release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1/GSD_CONTEXT_USED.md`
- Previous contour: `.planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/PLAN.md`
