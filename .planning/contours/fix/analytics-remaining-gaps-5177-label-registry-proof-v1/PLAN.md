# PLAN — fix/analytics-remaining-gaps-5177-label-registry-proof-v1

- **run_id**: `20260521T220729Z-45324`
- **contour**: `fix/analytics-remaining-gaps-5177-label-registry-proof-v1`
- **mode**: `SINGLE_EXECUTOR_MODE`
- **planner**: Agent 1
- **created_at**: `2026-05-21T22:08Z`

## 1. Source / Runtime Truth

| Fact | Value |
|------|-------|
| workspace | `/opt/processmap-test` |
| branch | `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1` |
| HEAD | `7fb0353` |
| origin/main | unreachable (SSH key permissions) — local truth only |
| tree state | clean except pre-existing `AGENTS.md` modification |
| current version | `v1.0.143` |
| frontend build | ✅ passes (`npm run build` 27.69s, 0 errors) |
| frontend tests | ⚠️ 2 failures in analytics suite (30/32 pass) |
| local dev server | ✅ `http://localhost:5177/` → HTTP 200 |

## 2. Bounded Scope

Fix **stale test assertions** left behind after the v1.0.143 version bump in the previous contour. No product code changes.

**In scope:**
1. Update `ProcessPropertiesRegistryPage.test.mjs` test 5: `v1.0.142` → `v1.0.143`.
2. Update `ProductActionsRegistryPage.test.mjs` test 2: `Скачать CSV` → `CSV`, `Скачать XLSX` → `XLSX`.
3. Run full analytics test suite → confirm 32/32 pass.
4. Run full frontend build → confirm 0 errors.
5. Verify local `:5177` serves fresh build with correct version marker.

**Out of scope:**
- No product runtime code changes (`.jsx`, `.css`, `.js`).
- No backend changes.
- No version bump (this contour only fixes tests; version stays v1.0.143).
- No merge, deploy, or PR.

## 3. Execution Steps (single lane)

1. **State verification** — confirm branch, HEAD, clean tree, version v1.0.143.
2. **Fix test 1** — `ProcessPropertiesRegistryPage.test.mjs` line 69-70: replace `v1.0.142` with `v1.0.143`.
3. **Fix test 2** — `ProductActionsRegistryPage.test.mjs` line 38-39: replace `Скачать CSV` with `CSV`, `Скачать XLSX` with `XLSX`.
4. **Run analytics tests** — `node --test src/components/process/analysis/*.test.mjs` → assert 32/32 pass.
5. **Run build** — `npm run build` → assert 0 errors.
6. **5177 proof** — `curl -s http://localhost:5177/assets/index-*.js | grep -o "v1.0.143" | wc -l` ≥ 1.
7. **5-plane proof** — code / workspace / DB / env / serving mode.

## 4. Acceptance Criteria

- [ ] `node --test src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` → 5/5 pass.
- [ ] `node --test src/components/process/analysis/ProductActionsRegistryPage.test.mjs` → 4/4 pass.
- [ ] `node --test src/components/process/analysis/*.test.mjs` → 32/32 pass.
- [ ] `npm run build` succeeds with no new warnings.
- [ ] Local `:5177` bundle contains `v1.0.143`.
- [ ] No product `.jsx`/`.css`/`.js` files modified.
- [ ] Only 2 `.test.mjs` files changed.

## 5. Blockers & Risks

- **BLOCKER**: None. This is a test-only fix with no runtime risk.
- **Risk**: If `:5177` is not serving the current build, executor must rebuild (`npm run build`) and restart dev server.

## 6. Context Sources

- RAG preflight: `.planning/contours/fix/analytics-remaining-gaps-5177-label-registry-proof-v1/RAG_PREFLIGHT_PLANNER.md`
- Obsidian context: `.planning/contours/fix/analytics-remaining-gaps-5177-label-registry-proof-v1/OBSIDIAN_CONTEXT_USED.md`
- GSD context: `.planning/contours/fix/analytics-remaining-gaps-5177-label-registry-proof-v1/GSD_CONTEXT_USED.md`
- Previous contour plan: `.planning/contours/fix/analytics-runtime-navigation-registry-ui-hard-restore-v1/PLAN.md`
- Previous contour review: `.planning/contours/fix/analytics-runtime-navigation-registry-ui-hard-restore-v1/REVIEW_REPORT.md`
