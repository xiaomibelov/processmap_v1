# Agent 2 / Worker 2 — backend source/contract lane

> **Контур:** `feature/product-actions-registry-backend-view-model-hardening-v1`  
> **Run ID:** `20260519T110751Z-24254`  
> **Статус:** DONE  
> **Режим:** proxy execution, без серверного LLM из-за лимитов

## Проверенные файлы

- `backend/app/routers/product_actions_registry.py`
- `backend/app/storage.py`
- `backend/tests/test_product_actions_registry_api.py`
- `frontend/src/lib/apiRoutes.js`
- `frontend/src/lib/api.js`

## Текущие endpoints

Текущая backend truth подтверждена:

- `POST /api/analysis/product-actions/registry/query`
- `POST /api/analysis/product-actions/registry/export.csv`
- `POST /api/analysis/product-actions/registry/export.xlsx`

`/api/analytics/*` в этом контуре не является текущим endpoint namespace и должен оставаться только будущей миграцией.

## Request contract

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

## Response contract

`_registry_payload` возвращает:

- `ok`
- `scope`
- `rows`
- `summary`
- `sessions`
- `session_summary`
- `page`

`rows` содержит org/workspace/project/session/action identifiers, product/action fields, BPMN element reference, duration fields, `source`, `confidence`, `updated_at`, `diagram_state_version`, `completeness`, `missing_fields`.

`summary` считает filtered row universe:

- `projects_total`
- `sessions_total`
- `actions_total`
- `complete`
- `incomplete`

`session_summary` считает session universe:

- `projects_total`
- `sessions_total`
- `sessions_with_actions`
- `sessions_without_actions`
- `actions_total`
- `complete`
- `incomplete`

`page` содержит:

- `limit`
- `offset`
- `total`
- `has_more`

## Storage truth

`list_product_action_registry_sources` читает минимальный набор:

- session id/title/project/org;
- project title/workspace/folder;
- `interview_json` только для извлечения `analysis.product_actions[]`;
- `diagram_state_version`;
- `updated_at`.

Функция явно не выбирает BPMN XML, BPMN meta, notes, reports, resources, analytics или normalized payloads. Это соответствует read-only boundary и снижает риск тяжёлых payload.

## Backend gaps

- Нет `filter_options`, поэтому frontend строит варианты фильтров локально.
- Нет `applied_filters`, поэтому UI не получает нормализованную server truth по фильтрам.
- Нет `empty_state.kind/message_key`.
- Нет `source_state`, который явно фиксирует `registry_backend`, `heavy_payload_excluded=true`, source summary.
- `summary` есть, но не разделяет `total_before_filters`, `filtered_total`, `page_count`.
- Error taxonomy в основном через HTTP status/detail; response-level warnings отсутствуют.
- Export использует тот же `_registry_payload`, но acceptance должен явно закрепить query/export parity.

## Минимальный backend hardening plan

Следующий implementation contour должен:

1. Сохранить текущие endpoints без rename.
2. Добавить backward-compatible поля: `filter_options`, `applied_filters`, `empty_state`, `source_state`.
3. Расширить `summary` или добавить `metrics` без удаления текущих ключей.
4. Доказать тестами, что `summary/filter_options` считаются по filtered universe, а `rows` является page slice.
5. Закрепить CSV/XLSX parity с query filters/session_ids.
6. Сохранить запрет на BPMN XML mutation, Product Actions durable mutation, AI auto-write и RAG runtime changes.

## Blockers

Нет.

