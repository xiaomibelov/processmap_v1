# PLAN — feature/product-actions-registry-backend-view-model-hardening-v1

> **Роль:** Agent 1 / Planner  
> **Run ID:** `20260519T110751Z-24254`  
> **Дата:** 2026-05-19  
> **Статус:** READY_FOR_EXECUTION  
> **Тип контура:** planning-only для следующего backend implementation contour

## 1. Текущая source truth

Текущие рабочие endpoints реестра действий находятся только в текущем namespace:

- `POST /api/analysis/product-actions/registry/query`
- `POST /api/analysis/product-actions/registry/export.csv`
- `POST /api/analysis/product-actions/registry/export.xlsx`

Файлы-источники:

- backend route: `backend/app/routers/product_actions_registry.py`
- storage source extractor: `backend/app/storage.py`, `list_product_action_registry_sources`
- backend tests: `backend/tests/test_product_actions_registry_api.py`
- frontend route constants: `frontend/src/lib/apiRoutes.js`
- frontend API wrapper: `frontend/src/lib/api.js`
- frontend model/fallback logic: `frontend/src/features/process/analysis/productActionsRegistryModel.js`
- frontend UI usage: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- registry UI components: `frontend/src/components/process/analysis/registry/*`

`/api/analytics/*` — только draft target для будущей миграции. В этом контуре endpoint rename запрещён.

## 2. Почему нужен backend view-model hardening

Backend уже отдаёт read-only агрегат Product Actions Registry, но контракт ещё не является полноценным view-model для тонкого клиента. Frontend всё ещё:

- запрашивает до `limit: 1000`, затем фильтрует локально;
- строит `filter_options` из загруженных строк;
- пересчитывает summary/filtered summary локально;
- делает локальную pagination через `slice`;
- нормализует backend rows/sessions;
- имеет project/session fallback, который грузит полные session и строит rows из `interview.analysis.product_actions`;
- формирует export payload отдельно от текущего server-side query state.

Это создаёт риск расхождения UI и export, лишней нагрузки на frontend и повторного появления frontend-heavy registry logic.

## 3. Текущий backend request/response contract

### Request

`ProductActionsRegistryQueryIn`:

- `scope`: `workspace | project | session`
- `workspace_id`
- `project_id`
- `session_id`
- `project_ids`
- `session_ids`
- `filters`
- `limit`
- `offset`

`ProductActionsRegistryFilters`:

- `product_groups`
- `products`
- `action_types`
- `stages`
- `object_categories`
- `roles`
- `completeness`: `all | complete | incomplete`

### Response

`_registry_payload` возвращает:

- `ok`
- `scope`
- `rows`
- `summary`
- `sessions`
- `session_summary`
- `page`

`rows` включают идентификаторы org/workspace/project/session/action, business fields, `source`, `confidence`, `updated_at`, `diagram_state_version`, `completeness`, `missing_fields`.

`summary` сейчас включает:

- `projects_total`
- `sessions_total`
- `actions_total`
- `complete`
- `incomplete`

`session_summary` сейчас включает:

- `projects_total`
- `sessions_total`
- `sessions_with_actions`
- `sessions_without_actions`
- `actions_total`
- `complete`
- `incomplete`

`page` сейчас включает:

- `limit`
- `offset`
- `total`
- `has_more`

## 4. Gaps, которые должен закрыть следующий implementation contour

### Backend source/contract gaps

- Нет явного `filter_options` в response; frontend строит их из текущей страницы/загруженных строк.
- Нет отдельного `view_model` / `metrics` слоя для UI labels, empty state и filtered totals.
- Нет явного `applied_filters` / normalized filters в response.
- Нет response-level `errors`/`warnings` taxonomy, кроме HTTP status/detail.
- Нет явного `source_state` для объяснения, откуда пришли строки: backend registry, rows fallback, empty session summary.
- Export endpoints используют тот же query shape, но контракт должен явно закрепить совпадение query/export filters.
- Pagination hardening должен доказать, что summary/filter options считаются по filtered universe, а `rows` только по requested page.

### Frontend thin-client gaps

- `ProductActionsRegistryPanel.jsx` сам делает `normalizeBackendRows`, `normalizeBackendSessions`, `summarizeRowsAsSessions`.
- `productActionsRegistryModel.js` содержит локальные `filterProductActionRegistryRows`, `uniqueProductActionRegistryFilterOptions`, `summarizeProductActionRegistryRows`.
- UI pagination сейчас frontend-only (`filteredRows.slice(...)`).
- `buildExportPayload` повторно мапит UI filters в backend filter families.
- Project fallback через `apiGetSession` остаётся временным small-scope fallback и должен стать legacy path после backend hardening.

## 5. Bounded implementation plan для следующего контура

Следующий implementation contour должен быть backend-first и совместимый:

1. Зафиксировать текущий контракт тестами snapshot-like уровня для `/api/analysis/product-actions/registry/query`.
2. Добавить server-side `filter_options` по тем же filter families, что UI уже использует.
3. Добавить `applied_filters` с нормализованными значениями.
4. Добавить `metrics` или расширенный `summary` для:
   - total rows before filters;
   - filtered rows total;
   - page rows count;
   - complete/incomplete totals after filters;
   - sessions visible/with actions/without actions.
5. Добавить `empty_state`:
   - `kind`: `no_scope | no_sessions | no_actions | no_filtered_rows`
   - `message_key`: стабильный ключ, не длинный UI-текст.
6. Добавить `source_state`:
   - `source`: `registry_backend`
   - `session_summary_source`: `storage | rows_fallback`
   - `heavy_payload_excluded`: `true`
7. Сохранить существующие поля `rows`, `summary`, `sessions`, `session_summary`, `page` без breaking changes.
8. Синхронизировать export tests: CSV/XLSX должны применять те же filters/session_ids, что query.
9. Не добавлять `/api/analytics/*`; при необходимости описать future migration plan только в docs.

## 6. Строгие non-goals

- Не реализовывать product code в Agent 1.
- Не делать frontend redesign.
- Не делать Properties Registry implementation.
- Не делать Diagram overlays implementation.
- Не делать schema migration, если source явно не докажет необходимость.
- Не устанавливать packages.
- Не делать merge/PR/deploy.
- Не создавать fake data.
- Не переименовывать endpoints в `/api/analytics/*`.
- Не мутировать BPMN XML.
- Не мутировать durable truth `interview.analysis.product_actions[]`.
- Не делать AI auto-write.
- Не менять RAG runtime.

## 7. Worker split

### Agent 2 / Worker — backend source/contract lane

Независимо инспектирует backend route/storage/tests, документирует текущий endpoint contract, находит gaps в `summary`, `filters`, `sources`, `pagination`, проектирует минимальные backend hardening changes и создаёт `WORKER_2_DONE`.

### Agent 3 / Worker — frontend thin-client/readiness lane

Не ждёт Agent 2. Инспектирует frontend registry usage, выявляет frontend computations, определяет target thin-client contract, готовит Agent 4 review checklist и создаёт `WORKER_3_DONE`.

### Agent 4 / Reviewer

Ждёт `WORKER_2_DONE` и `WORKER_3_DONE`. Проверяет, что source maps grounded in actual files/endpoints, namespace `/api/analysis/product-actions/registry/*` сохранён, план backend contract конкретный, mutation boundary не нарушен.

## 8. Agent 4 gates

`REVIEW_PASS` разрешён только если:

- source maps ссылаются на реальные файлы и endpoints;
- текущий namespace `/api/analysis/product-actions/registry/*` соблюдён;
- `/api/analytics/*` указан только как future migration target;
- backend contract plan конкретно описывает request/response additions;
- frontend thin-client target не требует redesign;
- нет BPMN XML mutation;
- нет durable Product Actions mutation;
- нет AI auto-write;
- нет RAG runtime changes;
- следующий implementation contour bounded и может быть выполнен без schema/package changes.

`CHANGES_REQUESTED` обязателен, если worker reports уходят в frontend redesign, Properties Registry, Diagram overlays или endpoint rename.

`REVIEW_BLOCKED.md` обязателен, если не удалось подтвердить реальные source files/endpoints.

## 9. Planning validation

- Worker 3 не зависит от Worker 2.
- Только Agent 4 ждёт оба worker markers.
- Part-specific block markers only:
  - `EXEC_PART_1_BLOCKED.md`
  - `EXEC_PART_2_BLOCKED.md`
- Agent 1 product-code changes: отсутствуют.

