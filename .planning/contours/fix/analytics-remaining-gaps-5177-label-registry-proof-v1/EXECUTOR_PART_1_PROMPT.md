# Executor Part 1 Prompt — fix/analytics-remaining-gaps-5177-label-registry-proof-v1

- **run_id**: `20260521T220729Z-45324`
- **contour**: `fix/analytics-remaining-gaps-5177-label-registry-proof-v1`
- **mode**: single-lane (TOKEN_ECONOMY_SINGLE_EXECUTOR)

## Your Task

Fix 2 stale test assertions in the analytics test suite. No product code changes.

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs` | Test 5 (lines 69-70): replace `v1.0.142` with `v1.0.143` in both assertions |
| `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | Test 2 (lines 38-39): replace `Скачать CSV` with `CSV`, replace `Скачать XLSX` with `XLSX` |

## Commands to Run (in order)

1. State verification:
   ```bash
   cd /opt/processmap-test
   git branch --show-current
   git rev-parse HEAD
   git status -sb
   ```

2. Fix tests:
   ```bash
   cd /opt/processmap-test/frontend
   sed -i 's/v1\.0\.142/v1.0.143/g' src/components/process/analysis/ProcessPropertiesRegistryPage.test.mjs
   sed -i 's/Скачать CSV/CSV/g' src/components/process/analysis/ProductActionsRegistryPage.test.mjs
   sed -i 's/Скачать XLSX/XLSX/g' src/components/process/analysis/ProductActionsRegistryPage.test.mjs
   ```

3. Run analytics tests:
   ```bash
   cd /opt/processmap-test/frontend
   node --test src/components/process/analysis/*.test.mjs
   ```
   Must show: 32 tests, 32 pass, 0 fail.

4. Build:
   ```bash
   cd /opt/processmap-test/frontend
   npm run build
   ```
   Must complete with 0 errors.

5. 5177 proof:
   ```bash
   curl -s http://localhost:5177/assets/index-*.js | grep -o "v1.0.143" | wc -l
   ```
   Must be ≥ 1. If 0, run `npm run build` and verify again.

6. Git proof:
   ```bash
   cd /opt/processmap-test
   git diff --stat
   git diff --name-only
   ```
   Must show exactly 2 changed files, both `.test.mjs`.

## Acceptance Criteria

- [ ] `ProcessPropertiesRegistryPage.test.mjs` → 5/5 pass.
- [ ] `ProductActionsRegistryPage.test.mjs` → 4/4 pass.
- [ ] Full analytics suite → 32/32 pass.
- [ ] `npm run build` → 0 errors.
- [ ] `:5177` bundle contains `v1.0.143`.
- [ ] Only 2 test files modified.

## Rules

- Do NOT modify any `.jsx`, `.css`, `.js` product files.
- Do NOT bump version.
- Do NOT merge, deploy, or open a PR.
- Write `EXEC_PART_1_REPORT.md` in the contour directory with results.
