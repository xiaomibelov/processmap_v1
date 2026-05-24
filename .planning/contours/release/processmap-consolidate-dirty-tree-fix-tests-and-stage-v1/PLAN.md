# PLAN — release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1

- run_id: `20260521T090400Z-76203`
- contour: `release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1`
- mode: `SINGLE_EXECUTOR_MODE`
- planner: Agent 1
- created_at: `2026-05-21T09:04Z`

## 1. Source / Runtime Truth

| Fact | Value |
|------|-------|
| workspace | `/opt/processmap-test` |
| branch | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `a2359d8ce732ab89f8911ec0479500ecd660a764` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| commits ahead of main | 2 (`75c53c5`, `a2359d8`) |
| tree state | dirty: 13 modified files (+544/−25), many untracked artifacts |
| current version (uncommitted) | `v1.0.139` (HEAD still at `v1.0.126`) |

## 2. Bounded Scope

This contour is strictly **consolidation, test repair, and staging**. No new product features.

### 2.1 Tree Consolidation
- Decide fate of each uncommitted modification:
  - **Keep & commit** if it belongs to the `process-properties-registry` feature.
  - **Discard / stash** if it is local noise (`.env` tweaks, screenshots, accidental edits).
  - **Clean untracked artifacts** that are not part of the release (screenshots, dist backups, handoff duplicates).
- Ensure the branch ends with a **clean tree** (no uncommitted product-code changes) before test work begins.
- Preserve legitimate untracked product files (e.g. `ProcessAnalyticsHub.jsx`, new registry components) by committing them if they are intentional.

### 2.2 Fix Tests
**Backend** — all green already; executor must re-run to confirm.
**Frontend** — 12 failures in 2 files:

| File | Failures | Root Cause (preliminary) |
|------|----------|--------------------------|
| `ProductActionsRegistryPanel.test.mjs` | 2 | Label assertions out of sync with evolved component text ("Read-only preview", "Реестр действий"). |
| `ProcessAnalyticsHub.test.mjs` | 10 | Test was written against a planned component architecture; actual `ProcessAnalyticsHub.jsx` implementation and integration points differ (missing testids, CSS classes, route-model exports, wiring in ProcessStage/Explorer/AppShell/TopBar, version string mismatch). |

Executor must reconcile each failing assertion with the **actual runtime code** — update tests where the code is authoritative, or fix code where the test represents the contract.

### 2.3 Stage v1
- Bump `frontend/src/config/appVersion.js` from `v1.0.139` → `v1.0.140` per iron rule.
- Add changelog entry in Russian describing this consolidation contour.
- Build frontend dist (`npm run build` or equivalent).
- Verify `build-info.json` is produced and `dirty=false` after tree cleanup.

## 3. Execution Steps (single lane)

1. **Audit dirty tree** — classify every modified and untracked file as keep/commit, discard, or defer.
2. **Clean & commit** — produce clean index; commit feature changes; discard noise.
3. **Run backend tests** — `python -m unittest discover -s tests -v`; confirm all pass.
4. **Run frontend tests** — `node --test src/**/*.test.mjs`; capture failures.
5. **Fix frontend test failures** — reconcile `ProductActionsRegistryPanel.test.mjs` and `ProcessAnalyticsHub.test.mjs`.
6. **Re-run full test suite** — confirm zero failures.
7. **Bump version** → `v1.0.140` with changelog.
8. **Build dist** — verify artifacts and `dirty=false`.
9. **Git proof** — record final `git status -sb`, `git log --oneline -3`, `git diff --stat`.

## 4. Acceptance Criteria

- [ ] Working tree is clean (`git status -sb` shows no uncommitted product-code changes).
- [ ] Backend unittest suite passes with 0 failures.
- [ ] Frontend `node --test` suite passes with 0 failures.
- [ ] `appVersion.js` reads `currentVersion: "v1.0.140"` with a changelog entry.
- [ ] Frontend dist builds successfully.
- [ ] `build-info.json` (if present) has `dirty: false`.
- [ ] No secrets committed.

## 5. Blockers & Risks

- **Risk**: Some untracked files (screenshots, dist backups) may be large; executor must not `git add` them blindly.
- **Risk**: `ProcessAnalyticsHub.test.mjs` failures may indicate the component is incomplete; if so, executor must document gaps rather than rewrite the component.
- **Risk**: `.env` modification must not be committed.

## 6. Context Sources

- RAG preflight: `.planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/RAG_PREFLIGHT_PLANNER.md`
- Obsidian context: `.planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/OBSIDIAN_CONTEXT_USED.md`
- GSD context: `.planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/GSD_CONTEXT_USED.md`
