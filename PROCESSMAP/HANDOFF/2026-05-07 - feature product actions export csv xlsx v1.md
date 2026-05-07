# 2026-05-07 - feature product actions export csv xlsx v1

Контур: `feature/product-actions-export-csv-xlsx-v1`

## Где мы / зачем / что стало видимым

`interview.analysis.product_actions[]` остаётся durable source для действий с продуктом. Реестр действий с продуктом уже показывал workspace/project/session scope и action rows через backend aggregation.

Этот контур добавил конечный пользовательский результат: выгрузку текущего реестра в CSV/XLSX без AI, без BPMN XML и без загрузки full sessions на frontend.

В реестре стали видимы:

| UI | Result |
| --- | --- |
| `Скачать CSV` | downloads current scope/filter/selected sessions as CSV |
| `Скачать XLSX` | downloads current scope/filter/selected sessions as XLSX |
| Export summary | shows rows count, complete/incomplete count and active filters |
| Empty/loading/error states | export disabled while no rows/loading; bounded error copy shown on failure |

## GSD status

| Check | Result |
| --- | --- |
| GSD CLI | `GSD_UNAVAILABLE`: `gsd` not found |
| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
| `route.next-action` | unsupported / unknown query |
| `check.phase-ready` | unsupported / unknown query |
| Route | manual fallback execution with GSD-required source checks |

## Source truth

| Field | Value |
| --- | --- |
| Worktree | `/tmp/processmap_product_actions_export_csv_xlsx_v1` |
| Branch | `feature/product-actions-export-csv-xlsx-v1` |
| Base | stacked on `feature/product-actions-registry-bulk-ai-suggestions-v1` |
| Base HEAD | `b8909c1 feat: add bulk ai suggestions for product actions registry` |
| Main repo state | original canonical worktree was dirty, so work was isolated in clean temp worktree |

Obsidian-first sources read:

- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/06_Backend API карта.md`
- `PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md`
- `PROCESSMAP/PROJECT ATLAS/15_Backlog контуров.md`
- `PROCESSMAP/PROJECT ATLAS/16_Журнал решений.md`

## Precheck result

Verdict: `PASS`.

Checked before implementation:

| Precheck | Result |
| --- | --- |
| Registry rows by workspace/project/session | backend registry API tests passed |
| Backend query avoids full frontend session loads | registry source uses backend storage aggregation |
| Rows have session/project context | existing registry rows/session summaries available |
| Blocking 500 in registry query | none found in focused tests |

Commands:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_registry_api
cd frontend && node --test src/components/process/analysis/ProductActionsRegistryPanel.test.mjs src/components/process/analysis/ProductActionsRegistryPage.test.mjs
```

## Export source decision

Export is backend-generated from the existing product actions registry aggregation.

Reasons:

- one source for registry query and export filtering semantics;
- no frontend loading of all full sessions;
- no BPMN XML read path for export;
- read-only by construction;
- easier to set correct content type, filename and spreadsheet bytes.

## Endpoint contract

| Method | Endpoint | Response |
| --- | --- | --- |
| POST | `/api/analysis/product-actions/registry/export.csv` | `text/csv; charset=utf-8` with attachment filename |
| POST | `/api/analysis/product-actions/registry/export.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with attachment filename |

Request reuses registry query shape:

- `scope`
- `workspace_id`
- `project_id`
- `session_id`
- selected `session_ids`
- `filters`
- `limit`
- `offset`

Supported filter families follow the registry UI/API:

- `product_groups`
- `products`
- `action_types`
- `stages`
- `object_categories`
- `roles`
- `completeness`

## CSV/XLSX format details

Stable column order:

1. `workspace_title`
2. `project_title`
3. `project_id`
4. `session_title`
5. `session_id`
6. `product_group`
7. `product_name`
8. `action_type`
9. `action_stage`
10. `action_object_category`
11. `action_object`
12. `action_method`
13. `role`
14. `step_label`
15. `step_id`
16. `bpmn_element_id`
17. `work_duration_sec`
18. `wait_duration_sec`
19. `source`
20. `confidence`
21. `completeness`
22. `updated_at`

CSV:

- UTF-8 BOM included;
- delimiter: `;`;
- Python `csv.writer` handles quotes, semicolons and newlines.

XLSX:

- one worksheet: `Product actions`;
- header row included;
- readable column widths;
- no formulas/macros;
- generated as bounded OOXML with stdlib zip/XML helpers, no new dependency.

Filename pattern:

- `product-actions-{scope}-{YYYYMMDD-HHMM}.csv`
- `product-actions-{scope}-{YYYYMMDD-HHMM}.xlsx`

## UI behavior

`ProductActionsRegistryPanel` now:

- shows active export summary;
- passes current scope, selected sessions and filters to export endpoints;
- disables export when rows are empty or registry/export is loading;
- downloads the returned blob with backend-provided filename;
- shows bounded success/error status;
- keeps CSV/XLSX unavailable when no rows match the current filter set.

## File validation proof

Backend tests validate:

- CSV content type and filename;
- CSV BOM;
- stable CSV header order;
- escaping of semicolons, quotes and newlines;
- XLSX response content type and filename;
- valid zip workbook with expected workbook/sheet entries;
- expected worksheet name/header/cell content;
- filters and zero rows;
- scope guard parity with registry query.

Frontend tests validate:

- export buttons render;
- buttons replace old placeholder copy;
- buttons are disabled on zero rows/loading;
- current filters/selected sessions are passed to export wrappers;
- download helper receives returned blob/filename;
- API wrappers use binary endpoints and content-disposition filename.

## Tests/build

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| `PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_registry_api` | PASS, 10 tests |
| `cd frontend && node --test src/lib/apiRoutes.test.mjs src/lib/api.projectSessions.test.mjs src/components/process/analysis/ProductActionsRegistryPanel.test.mjs src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | PASS, 22 tests |
| `npm --prefix frontend run build` | PASS |

Build note: the temp worktree initially had no `frontend/node_modules`, so `npm --prefix frontend ci` was run before build. NPM reported existing audit state: 7 vulnerabilities. No audit fix was run in this contour.

## Obsidian updates

Updated:

- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/06_Backend API карта.md`
- `PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md`
- `PROCESSMAP/PROJECT ATLAS/15_Backlog контуров.md`
- `PROCESSMAP/PROJECT ATLAS/16_Журнал решений.md`

## Commit/push/PR status

Commit created:

```text
feat: export product actions registry to csv and xlsx
```

Push/PR/merge/deploy: not done in this contour.

## Explicit unchanged

| Area | Result |
| --- | --- |
| `product_actions` save path | unchanged |
| AI execution | no AI calls added or run |
| Prompts | unchanged |
| BPMN XML | unchanged; export does not mutate or directly read BPMN XML |
| Generic autosave | unchanged |
| Taxonomy admin | not added |
| Merge/deploy/PR | not done |
