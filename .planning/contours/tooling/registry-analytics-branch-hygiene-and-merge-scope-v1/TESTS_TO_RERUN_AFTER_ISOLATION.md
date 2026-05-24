# TESTS_TO_RERUN_AFTER_ISOLATION

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Run ID: `20260517T191023Z-10717`

## Focused tests

Run from `frontend/` on the clean branch:

```bash
node --test \
  src/components/process/analysis/ProductActionsRegistryPanel.test.mjs \
  src/components/process/analysis/ProductActionsRegistryPage.test.mjs \
  src/components/process/analysis/ProcessAnalyticsHub.test.mjs
```

Expected from accepted review evidence: 25 tests passed, 0 failed.

## Build

Run the repo-accepted frontend build path. Previous evidence notes standard build may need sourcemap disabled on this host because of OOM:

```bash
npm run build -- --sourcemap false
```

If the clean environment supports the normal build without OOM, prefer the normal project command and record the exact command.

## Runtime smoke

After serving the clean branch build:

```bash
curl -I http://clearvestnic.ru:5180/
curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"
curl -s http://clearvestnic.ru:8088/health
```

Expected:

- frontend returns `HTTP 200`;
- no-cache headers present;
- build-info branch/SHA match the clean branch;
- backend health `ok=true`.

## Browser checks

1. Fresh browser context.
2. Open `/app?surface=analytics`.
3. Verify Hub title, summary cards, `Реестр действий`, `Реестр свойств`, `Дашборды`, `Экспорт`.
4. Click `Реестр действий` -> `Открыть`.
5. Verify URL includes `surface=product-actions-registry&return_to=analytics`.
6. Verify populated project scope:
   - rows render;
   - pagination renders;
   - warning/incomplete state remains when applicable.
7. Verify empty workspace/project scope:
   - metrics visible;
   - filters/actions visible;
   - AI controls visible before table;
   - table headers visible;
   - empty message visible;
   - pagination shell visible;
   - `Источники данных` below pagination.
8. Verify `Вернуться` returns to Analytics.
9. Verify console/network:
   - no `ReferenceError`/`TypeError`;
   - no unexpected mutation requests from viewing/navigation;
   - no real-path registry query 4xx/5xx.

## Optional broader checks

Only after focused checks pass:

```bash
npm test
```

If broader tests fail, classify failures as in-scope or pre-existing before using them as merge blockers.

