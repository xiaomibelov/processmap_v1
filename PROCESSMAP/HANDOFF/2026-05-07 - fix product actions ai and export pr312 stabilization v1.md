# 2026-05-07 - fix product actions ai and export pr312 stabilization v1

Контур: `fix/product-actions-ai-and-export-pr312-stabilization-v1`

## Где мы / зачем / что стало видимым

PR #312 `feature/product-actions-export-csv-xlsx-v1` был открыт, но GitHub показывал merge conflicts. В PR были stacked изменения product-actions AI suggest, bulk AI suggest и CSV/XLSX export. На runtime/stage были reports о raw 500:

- `POST /api/sessions/{sid}/analysis/product-actions/suggest`
- `POST /api/analysis/product-actions/suggest-bulk`

Контур не мержит PR. Он стабилизирует PR branch:

- session-level AI suggest возвращает controlled setup/provider errors instead of raw 500;
- bulk AI suggest returns per-session controlled errors instead of collapsing the whole batch;
- PR branch conflict files are resolved against current `origin/main`;
- CSV/XLSX export remains read-only and separate from AI state.

## GSD status

| Check | Result |
| --- | --- |
| GSD CLI | `GSD_UNAVAILABLE`: `gsd` not found |
| GSD SDK | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, `v0.1.0` |
| `route.next-action` | unsupported / unknown query |
| `check.phase-ready` | unsupported / unknown query |
| Route | manual fallback with GSD-required source checks |

## Source truth

| Field | Value |
| --- | --- |
| Worktree | `/tmp/processmap_product_actions_export_csv_xlsx_v1` |
| Branch | `feature/product-actions-export-csv-xlsx-v1` |
| Branch HEAD before stabilization | `509e8809570fc17ad8b0e88addf2ec7494f8547b` |
| `origin/main` | `5bd1a8e1506ee6c0a1e0a8abe53ff82f6427979d` |
| Merge-base | `d92b16a55eb089d52b7e786aceab85f674ab7b0d` |
| PR #312 before fix | open, `mergeable=CONFLICTING`, `mergeStateStatus=DIRTY` |

Obsidian-first sources updated:

- `PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md`
- `PROCESSMAP/PROJECT ATLAS/22_AI слой и модули.md`
- `PROCESSMAP/PROJECT ATLAS/09_UI UX поверхности.md`
- `PROCESSMAP/PROJECT ATLAS/06_Backend API карта.md`
- `PROCESSMAP/PROJECT ATLAS/14_Журнал runtime evidence.md`
- `PROCESSMAP/PROJECT ATLAS/15_Backlog контуров.md`
- `PROCESSMAP/PROJECT ATLAS/16_Журнал решений.md`

## PR #312 conflict resolution summary

Conflict files:

- `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`
- `frontend/src/lib/apiRoutes.js`
- `frontend/src/lib/apiRoutes.test.mjs`

Resolution strategy:

- preserve latest `origin/main` registry/session summary/drilldown/bulk AI behavior;
- layer PR #312 CSV/XLSX export imports, routes, tests and UI controls on top;
- keep export read-only and independent from AI suggest endpoints.

## Root cause 500: session suggest

The session endpoint already had controlled responses for missing provider/prompt/provider failure, but those responses were reachable only after several setup steps succeeded. Raw 500 could still happen before or while returning a controlled error:

- prompt seed / active prompt lookup exception happened outside a guarded controlled-error path;
- provider settings/context setup exceptions could escape before response normalization;
- execution-log write was inside `_finish()` without guard, so a log table/write problem could turn a controlled setup error into raw 500.

Fix:

- context/settings/prompt setup now maps to controlled response envelopes;
- prompt lookup/seed failure returns `AI_PROMPT_NOT_CONFIGURED`;
- provider setup/read failure returns controlled `AI_PROVIDER_ERROR`;
- execution-log failure does not replace the response with 500; it appends warning `ai_execution_log_failed`.

## Root cause 500: bulk suggest

Bulk endpoint caught `HTTPException` per session, but any unexpected exception from the per-session suggest flow escaped and collapsed the whole batch.

Fix:

- bulk now catches generic per-session exceptions and returns a result object with:
  - `status=error`
  - `ok=false`
  - `error_code=AI_PROVIDER_ERROR`
  - bounded sanitized `error_message`
- other sessions can still complete and return suggestions/errors independently.

## Controlled error behavior

| Case | Response |
| --- | --- |
| Missing provider key | `ok=false`, `error=AI_PROVIDER_NOT_CONFIGURED` |
| Missing/failed prompt lookup | `ok=false`, `error=AI_PROMPT_NOT_CONFIGURED` |
| Provider failure / invalid response | `ok=false`, `error=AI_PROVIDER_ERROR` |
| Rate limit | `ok=false`, `message=AI_RATE_LIMIT_EXCEEDED` |
| Log write failure | no raw 500; warning added to response |
| Bulk per-session unexpected failure | per-session `status=error`, `error_code=AI_PROVIDER_ERROR` |

## Export behavior

CSV/XLSX export remains unchanged in intent:

- source: backend product-actions registry aggregation;
- endpoints:
  - `POST /api/analysis/product-actions/registry/export.csv`
  - `POST /api/analysis/product-actions/registry/export.xlsx`
- no AI call;
- no product_actions write;
- no BPMN XML mutation;
- no frontend full-session workspace scan.

## Tests/build

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| `PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_ai_suggest` | PASS, 13 tests |
| `PYTHONPATH=backend python -m unittest backend.tests.test_product_actions_registry_api` | PASS, 10 tests |
| `cd frontend && node --test src/lib/apiRoutes.test.mjs src/lib/api.productActionsAi.test.mjs src/lib/api.projectSessions.test.mjs src/components/process/interview/ProductActionsPanel.test.mjs src/components/process/analysis/ProductActionsRegistryPanel.test.mjs src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | PASS, 38 tests |
| `npm --prefix frontend run build` | PASS, existing Vite chunk-size warning |

## Commit/push status

Commit target:

```text
fix: stabilize product actions ai and export pr
```

Push target: existing branch `feature/product-actions-export-csv-xlsx-v1`.

PR target: existing PR #312 only. No new PR.

Deploy/merge: not done.

## Explicit unchanged

| Area | Result |
| --- | --- |
| Auto-write product actions | no |
| `product_actions` save path | unchanged |
| BPMN XML | unchanged |
| Generic Interview autosave | unchanged |
| Notes extraction | unchanged |
| Prompt text semantics | unchanged |
| CSV/XLSX export source | registry aggregation remains source |
| Deploy | not done |
| Merge PR | not done |
