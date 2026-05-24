# PLAN — feature/product-actions-registry-backend-contract-fields-v1

> **Роль:** Agent 1 / Planner  
> **Run ID:** `20260519T123355Z-63290`  
> **Дата:** 2026-05-19  
> **Статус:** READY_FOR_EXECUTION  
> **Тип контура:** short implementation-first backend contract hardening

## 1. Source truth

Текущий backend namespace сохраняется:

- `POST /api/analysis/product-actions/registry/query`
- `POST /api/analysis/product-actions/registry/export.csv`
- `POST /api/analysis/product-actions/registry/export.xlsx`

`/api/analytics/*` в этом контуре не реализуется и не используется как rename target. Это только future migration target.

Предыдущий planning contour прошёл в proxy mode:

- `feature/product-actions-registry-backend-view-model-hardening-v1`

Текущие source files:

- `backend/app/routers/product_actions_registry.py`
- `backend/app/storage.py`, `list_product_action_registry_sources`
- `backend/tests/test_product_actions_registry_api.py`
- `frontend/src/lib/apiRoutes.js`
- `frontend/src/lib/api.js`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/features/process/analysis/productActionsRegistryModel.js`

## 2. Goal

Добавить backward-compatible поля в ответ существующего Product Actions Registry backend view-model, чтобы frontend мог двигаться к thin-client mode без breaking changes.

Новые additive fields:

- `filter_options`
- `applied_filters`
- `metrics`
- `empty_state`
- `source_state`

Существующие поля должны остаться:

- `ok`
- `scope`
- `rows`
- `summary`
- `sessions`
- `session_summary`
- `page`

## 3. Backward compatibility rules

- Не удалять и не переименовывать текущие keys.
- Не менять shape существующих `rows`, `summary`, `sessions`, `session_summary`, `page` без явной необходимости.
- Новые поля только additive.
- `query` и `export.*` продолжают принимать текущий request contract.
- CSV/XLSX columns остаются стабильными.
- HTTP status/error behavior остаётся совместимым.
- Invalid `scope` и invalid `completeness` продолжают давать `422`.
- Inaccessible project/session continues to return `404`.

## 4. Target additive contract

### `filter_options`

Server-side options по тем же families, что current UI:

- `product_groups`
- `products`
- `action_types`
- `stages`
- `object_categories`
- `roles`
- `completeness`

Правило: options должны считаться из source/filter universe до pagination, чтобы frontend не строил фильтры из одной страницы.

### `applied_filters`

Нормализованная копия применённых filters:

- списки очищены от пустых значений и дублей;
- `completeness` нормализован до `all | complete | incomplete`;
- unknown/invalid completeness остаётся validation error, а не молчаливый fallback.

### `metrics`

Минимальный target:

- `total_rows`
- `filtered_rows`
- `page_rows`
- `projects_total`
- `sessions_total`
- `sessions_with_actions`
- `sessions_without_actions`
- `complete`
- `incomplete`
- `limit`
- `offset`
- `has_more`

`summary` можно оставить текущим, но `metrics` должен явно описывать total/filter/page semantics.

### `empty_state`

Стабильный machine-readable объект:

- `kind`: `not_empty | no_scope | no_sessions | no_actions | no_filtered_rows`
- `scope`
- `message_key`

UI-текст не вшивать длинной строкой. Нужен стабильный key для frontend copy.

### `source_state`

Стабильный объект доказательства источника:

- `source`: `product_actions_registry_backend`
- `namespace`: `/api/analysis/product-actions/registry`
- `heavy_payload_excluded`: `true`
- `mutation_allowed`: `false`
- `session_summary_source`: `storage | rows_fallback | mixed`
- `sessions_scanned`
- `actions_scanned`

## 5. Query/filter/pagination hardening

Agent 2 должен сохранить текущую модель:

- rows фильтруются backend-side;
- `page.total` отражает filtered rows;
- `rows` содержит только requested page;
- `summary`/`metrics` не должны случайно считаться только по page rows;
- `filter_options` не должны ломаться при pagination;
- `offset` нормализуется в `>= 0`;
- `limit` остаётся clamp `1..1000`.

## 6. Query/export parity goal

Export endpoints уже идут через `_registry_payload`. Контур должен закрепить тестами:

- CSV/XLSX используют те же filters/scope/session_ids/project_ids;
- export zero rows сохраняет только header;
- export filtered rows совпадают с query filtered universe при same request;
- export не включает heavy payload и не мутирует session/project data.

## 7. Strict non-goals

- no endpoint rename;
- no `/api/analytics/*` implementation;
- no Properties Registry;
- no Diagram overlays;
- no RAG runtime changes;
- no frontend redesign;
- no schema migration;
- no package install;
- no BPMN XML mutation;
- no Product Actions durable truth mutation;
- no AI auto-write;
- no fake data;
- no PR/merge/deploy.

## 8. Worker split

### Agent 2 / Worker — backend implementation lane

Независимый scope:

- inspect current backend registry routes/storage/tests;
- add additive response fields: `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`;
- preserve existing clients;
- add/adjust backend tests for filters, pagination, empty state, source state;
- add query/export parity tests where current export path exists;
- write reports in Russian;
- create `WORKER_2_DONE`.

If blocked: create `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker — independent contract/test readiness lane

Независимый scope:

- do not wait for Worker 2;
- do not validate Worker 2 implementation;
- inspect current frontend expectations and API consumers;
- define expected response contract and compatibility rules;
- define query/export parity checklist;
- define Agent 4 runtime/API review checklist;
- write reports in Russian;
- create `WORKER_3_DONE`.

If blocked: create `EXEC_PART_2_BLOCKED.md`.

## 9. Agent 4 gates

`REVIEW_PASS` только если:

- current namespace `/api/analysis/product-actions/registry/*` preserved;
- `/api/analytics/*` не реализован;
- added fields are backward-compatible;
- backend tests pass;
- query/export parity proof exists;
- no mutation boundary violated;
- no frontend redesign/RAG/Properties/Overlay work leaked in;
- API contract concrete and tested.

`CHANGES_REQUESTED` если:

- поля добавлены breaking способом;
- export/query parity не доказан;
- frontend redesign или unrelated scope попал в diff;
- есть mutation BPMN XML/Product Actions durable truth/AI auto-write.

`REVIEW_BLOCKED.md` если:

- тесты не запускаются по инфраструктурной причине;
- невозможно доказать endpoint namespace/source maps.

## 10. Planning validation

- Worker 3 не зависит от Worker 2.
- Только Agent 4 ждёт оба worker markers.
- Допустимые block markers:
  - `EXEC_PART_1_BLOCKED.md`
  - `EXEC_PART_2_BLOCKED.md`
- Parallel mode required for this contour because Agent 2 implements backend while Agent 3 independently prepares contract/test readiness.

